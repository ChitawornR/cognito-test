import dotenv from 'dotenv'
dotenv.config()

import app from './app'
import { connectDB } from './config/database'

const PORT = process.env.PORT || 4000

async function main() {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
