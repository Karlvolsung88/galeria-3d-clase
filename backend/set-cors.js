const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'nyc3',
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  credentials: {
    accessKeyId: 'DO8013L487N2AL3FB4ND',
    secretAccessKey: '/OuRpuWy290o9s3ldGaZLZP2PGgMh+0gutpdqsyyI7I',
  },
  forcePathStyle: false,
});

(async () => {
  await s3.send(new PutBucketCorsCommand({
    Bucket: 'galeria-3d-files',
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['*'],
        MaxAgeSeconds: 86400,
      }],
    },
  }));
  console.log('CORS configured on galeria-3d-files');
})();
