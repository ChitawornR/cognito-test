import { Router } from 'express'
import {
  register,
  verifyEmail,
  login,
  verifyLoginOtp,
  logout,
  me,
  googleAuth,
  googleCallback,
} from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.post('/register', register)
router.post('/verify-email', verifyEmail)
router.post('/login', login)
router.post('/verify-login-otp', verifyLoginOtp)
router.post('/logout', logout)
router.get('/me', authMiddleware, me)
router.get('/google', googleAuth)
router.get('/google/callback', googleCallback)

export default router
