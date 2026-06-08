import mongoose from 'mongoose'
import { GridFSBucket, ObjectId } from 'mongodb'
import { Readable } from 'stream'

function getBucket(): GridFSBucket {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database not connected')
  return new GridFSBucket(db, { bucketName: 'fs' })
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ObjectId> {
  const bucket = getBucket()
  const stream = bucket.openUploadStream(filename, {
    metadata: { contentType: mimeType },
  })

  return new Promise((resolve, reject) => {
    const readable = Readable.from(buffer)
    readable.pipe(stream)
    stream.on('finish', () => resolve(stream.id as ObjectId))
    stream.on('error', reject)
  })
}

export async function downloadFile(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; filename: string }> {
  const bucket = getBucket()
  const objectId = new ObjectId(fileId)

  const files = await bucket.find({ _id: objectId }).toArray()
  if (!files.length) throw new Error('File not found')

  const file = files[0]
  const contentType = (file.metadata?.contentType as string) ?? 'application/octet-stream'
  const downloadStream = bucket.openDownloadStream(objectId)

  return { stream: downloadStream, contentType, filename: file.filename }
}

export async function deleteFile(fileId: string): Promise<void> {
  const bucket = getBucket()
  await bucket.delete(new ObjectId(fileId))
}
