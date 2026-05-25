import { Request, Response } from 'express';
const express = require('express');
const router = express.Router();
const Questionario = require('../models/questionario');
const { verifyToken } = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// POST /api/questionarios — create a new questionnaire (paciente only)
router.post('/', verifyToken, verifyTokenByRole('paciente'), async (req: Request, res: Response) => {
    try {
        const { paciente, data, humor, sintomas, notas } = req.body;
        const questionario = new Questionario({ paciente, data, humor, sintomas, notas });
        await questionario.save();
        res.status(201).json(questionario);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// GET /api/questionarios — list all questionnaires (psicologo, admin)
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (_req: Request, res: Response) => {
    try {
        const questionarios = await Questionario.find().populate('paciente');
        res.json(questionarios);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/questionarios/paciente/:pacienteId — get all questionnaires for a specific patient
// (must come before /:id to avoid route conflict)
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const questionarios = await Questionario.find({ paciente: req.params['pacienteId'] })
            .populate('paciente');
        res.json(questionarios);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/questionarios/:id — get one questionnaire by ID (psicologo, paciente, admin)
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const questionario = await Questionario.findById(req.params['id']).populate('paciente');
        if (!questionario) {
            return res.status(404).json({ error: 'Questionário não encontrado' });
        }
        res.json(questionario);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PUT /api/questionarios/:id — update a questionnaire (paciente only)
router.put('/:id', verifyToken, verifyTokenByRole('paciente'), async (req: Request, res: Response) => {
    try {
        const questionario = await Questionario.findByIdAndUpdate(
            req.params['id'],
            req.body,
            { new: true, runValidators: true }
        ).populate('paciente');
        if (!questionario) {
            return res.status(404).json({ error: 'Questionário não encontrado' });
        }
        res.json(questionario);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// DELETE /api/questionarios/:id — delete a questionnaire (psicologo, admin)
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const questionario = await Questionario.findByIdAndDelete(req.params['id']);
        if (!questionario) {
            return res.status(404).json({ error: 'Questionário não encontrado' });
        }
        res.json({ message: 'Questionário removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { questionarioRoutes: router };
