import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  cognitoSub: string
  email: string
  firstName: string
  lastName: string
  provider: 'email' | 'google'
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    cognitoSub: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    provider: { type: String, enum: ['email', 'google'], required: true },
  },
  { timestamps: true }
)

export const User = mongoose.model<IUser>('User', UserSchema)
