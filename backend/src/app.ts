import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.routes'
import formsRoutes from './routes/forms.routes'

const frontendUrl = process.env.FRONTEND_URL
if (!frontendUrl) throw new Error('FRONTEND_URL env var is required')

const app = express()

app.use(cors({
  origin: frontendUrl,
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/forms', formsRoutes)

export default app
