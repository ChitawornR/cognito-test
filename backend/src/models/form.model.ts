import mongoose, { Schema, Document, Types } from 'mongoose'

export type FormStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'cancelled'

export interface IForm extends Document {
  cognitoSub: string
  status: FormStatus
  companyName: string
  taxId: string
  businessType: string
  fileId: Types.ObjectId
  fileName: string
  fileMimeType: string
  submittedAt: Date
  updatedAt: Date
}

const FormSchema = new Schema<IForm>(
  {
    cognitoSub: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    companyName: { type: String, required: true },
    taxId: { type: String, required: true },
    businessType: { type: String, required: true },
    fileId: { type: Schema.Types.ObjectId, required: true },
    fileName: { type: String, required: true },
    fileMimeType: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

export const Form = mongoose.model<IForm>('Form', FormSchema)
