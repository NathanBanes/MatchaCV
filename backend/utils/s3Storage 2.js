const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

/**
 * Upload a file to S3
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key (path in bucket)
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<Object>} Upload result with S3 URL and key
 */
async function uploadFile(filePath, s3Key, contentType = 'application/octet-stream') {
    try {
        const fileContent = fs.readFileSync(filePath);
        
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: fileContent,
            ContentType: contentType,
        });

        await s3Client.send(command);

        // Construct the S3 URL
        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;

        console.log(`S3: File uploaded successfully: ${s3Key}`);
        
        return {
            url: s3Url,
            key: s3Key,
            bucket: BUCKET_NAME
        };
    } catch (error) {
        console.error('S3: Upload error:', error);
        throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
}

/**
 * Download a file from S3 to local filesystem
 * @param {string} s3Key - S3 object key
 * @param {string} localPath - Local file path to save to
 * @returns {Promise<string>} Local file path
 */
async function downloadFile(s3Key, localPath) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
        });

        const response = await s3Client.send(command);
        const fileContent = await streamToBuffer(response.Body);

        // Ensure directory exists
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(localPath, fileContent);

        console.log(`S3: File downloaded successfully: ${s3Key} -> ${localPath}`);
        
        return localPath;
    } catch (error) {
        console.error('S3: Download error:', error);
        throw new Error(`Failed to download file from S3: ${error.message}`);
    }
}

/**
 * Get a presigned URL for temporary access to a file
 * @param {string} s3Key - S3 object key
 * @param {number} expiresIn - URL expiration time in seconds (default: 3600)
 * @returns {Promise<string>} Presigned URL
 */
async function getFileUrl(s3Key, expiresIn = 3600) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn });
        return url;
    } catch (error) {
        console.error('S3: Get URL error:', error);
        throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
}

/**
 * Delete a file from S3
 * @param {string} s3Key - S3 object key
 * @returns {Promise<void>}
 */
async function deleteFile(s3Key) {
    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
        });

        await s3Client.send(command);
        console.log(`S3: File deleted successfully: ${s3Key}`);
    } catch (error) {
        console.error('S3: Delete error:', error);
        throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
}

/**
 * Generate S3 key for a resume file
 * @param {string} jobId - Job UUID
 * @param {string} filename - Original filename
 * @returns {string} S3 key
 */
function generateS3Key(jobId, filename) {
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    return `resumes/${jobId}/${timestamp}-${sanitizedBaseName}${ext}`;
}

/**
 * Convert stream to buffer
 * @param {Stream} stream - Readable stream
 * @returns {Promise<Buffer>} Buffer
 */
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = {
    uploadFile,
    downloadFile,
    getFileUrl,
    deleteFile,
    generateS3Key
};

