// Import AWS SDK S3 client and commands for S3 operations
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

// Import utility to generate pre-signed URLs
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Import sharp for image processing
const sharp = require("sharp");

// Initialize S3 client in the 'us-east-1' region
const s3 = new S3Client({ region: "us-east-1" });

// Define the name of the S3 bucket used for storing images
const bucketName = 'image-upload-327-bucket';

// Lambda handler function
exports.handler = async (event) => {
    try {
        console.log("Event received:", JSON.stringify(event));

        // Decode the base64 image from the request body
        const body = Buffer.from(event.body, 'base64');

        // Generate unique keys (filenames) using a timestamp
        const timestamp = Date.now();
        const originalKey = `images/original_${timestamp}.jpg`;
        const croppedKey = `images/cropped_${timestamp}.jpg`;

        // Step 1: Upload the original image to S3
        await s3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: originalKey,
            Body: body,
            ContentType: 'image/jpeg',
        }));

        // Step 2: Crop the image to a centered 300x300 square using sharp
        const sharpImage = sharp(body);
        const metadata = await sharpImage.metadata();

        // Calculate dimensions for center crop (handle small images gracefully)
        const cropSize = 300;
        const extractWidth = Math.min(cropSize, metadata.width);
        const extractHeight = Math.min(cropSize, metadata.height);
        const left = Math.floor((metadata.width - extractWidth) / 2);
        const top = Math.floor((metadata.height - extractHeight) / 2);

        // Extract and resize the cropped image
        const croppedImageBuffer = await sharpImage
            .extract({ left, top, width: extractWidth, height: extractHeight })
            .resize(300, 300) // force output to 300x300
            .toBuffer();

        // Upload the cropped image to S3
        await s3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: croppedKey,
            Body: croppedImageBuffer,
            ContentType: 'image/jpeg',
        }));

        // Step 3: Generate signed URLs for both images (valid for 5 minutes)
        const originalUrl = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: bucketName,
            Key: originalKey,
        }), { expiresIn: 60 * 5 });

        const croppedUrl = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: bucketName,
            Key: croppedKey,
        }), { expiresIn: 60 * 5 });

        // Return the URLs in the response
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            body: JSON.stringify({
                originalImageUrl: originalUrl,
                croppedImageUrl: croppedUrl
            }),
        };

    } catch (error) {
        // Catch and log any unexpected errors
        console.error("Upload error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error", error: error.message }),
        };
    }
};
