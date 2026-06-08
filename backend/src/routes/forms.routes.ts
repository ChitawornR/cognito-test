import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middleware/auth.middleware'
import { submitForm, getForms, getFormFile } from '../controllers/forms.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)
router.post('/', upload.single('file'), submitForm)
router.get('/', getForms)
router.get('/:id/file', getFormFile)

export default router
