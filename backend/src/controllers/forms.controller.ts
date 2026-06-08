import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { Form } from '../models/form.model'
import { uploadFile, downloadFile } from '../services/gridfs.service'

interface UploadedFile {
  buffer: Buffer
  originalname: string
  mimetype: string
}

type MulterRequest = AuthRequest & { file?: UploadedFile }

export async function submitForm(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { companyName, taxId, businessType } = req.body
    const file = (req as MulterRequest).file

    if (!companyName || !taxId || !businessType) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }
    if (!file) {
      res.status(400).json({ error: 'ID card file is required' })
      return
    }

    const cognitoSub = req.user!.cognitoSub

    // Cancel any active forms
    await Form.updateMany(
      { cognitoSub, status: { $in: ['pending', 'under_review'] } },
      { status: 'cancelled' }
    )

    // Upload file to GridFS
    const fileId = await uploadFile(file.buffer, file.originalname, file.mimetype)

    const form = await Form.create({
      cognitoSub,
      companyName,
      taxId,
      businessType,
      fileId,
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      submittedAt: new Date(),
    })

    res.status(201).json({
      id: form._id,
      status: form.status,
      companyName: form.companyName,
      taxId: form.taxId,
      businessType: form.businessType,
      submittedAt: form.submittedAt,
    })
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

export async function getForms(req: AuthRequest, res: Response): Promise<void> {
  try {
    const forms = await Form.find({ cognitoSub: req.user!.cognitoSub })
      .sort({ submittedAt: -1 })
      .select('-__v')

    res.json(forms.map((f) => ({
      id: f._id,
      status: f.status,
      companyName: f.companyName,
      taxId: f.taxId,
      businessType: f.businessType,
      fileName: f.fileName,
      submittedAt: f.submittedAt,
      updatedAt: f.updatedAt,
    })))
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

export async function getFormFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const form = await Form.findOne({
      _id: req.params.id,
      cognitoSub: req.user!.cognitoSub,
    })

    if (!form) {
      res.status(404).json({ error: 'Form not found' })
      return
    }

    const { stream, contentType, filename } = await downloadFile(form.fileId.toString())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`)
    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message })
      } else {
        res.destroy(err)
      }
    })
    stream.pipe(res)
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}
