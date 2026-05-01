const express = require('express');
const {
	saveOrUpdateSemester,
	getSemesters,
	deleteSemester,
	getAcademicSummary,
	saveStrategistSettings,
	getStrategistSettings
} = require('../controllers/academicController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', saveOrUpdateSemester);
router.get('/', getSemesters);
router.delete('/:semesterId', deleteSemester);
router.get('/summary', getAcademicSummary);
router.put('/strategist-settings', saveStrategistSettings);
router.get('/strategist-settings', getStrategistSettings);

module.exports = router;
