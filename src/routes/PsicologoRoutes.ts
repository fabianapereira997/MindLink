import { Request, Response } from 'express';
const express = require('express');
const router = express.Router();
const Psicologo = require('../models/psicologo');
const { verifyToken } = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// POST /api/psicologos — create psicologo profile
router.post('/', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { user, especialidade } = req.body;
        const psicologo = new Psicologo({ user, especialidade });
        await psicologo.save();
        res.status(201).json(psicologo);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// GET /api/psicologos — list all psicologos
router.get('/', verifyToken, async (_req: Request, res: Response) => {
    try {
        const psicologos = await Psicologo.find().populate('user', '-password');
        res.json(psicologos);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/psicologos/:id — get psicologo by id
router.get('/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const psicologo = await Psicologo.findById(req.params['id']).populate('user', '-password');
        if (!psicologo) {
            return res.status(404).json({ error: 'Psicólogo não encontrado' });
        }
        res.json(psicologo);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PUT /api/psicologos/:id — update psicologo
router.put('/:id', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const psicologo = await Psicologo.findByIdAndUpdate(
            req.params['id'],
            req.body,
            { new: true, runValidators: true }
        ).populate('user', '-password');
        if (!psicologo) {
            return res.status(404).json({ error: 'Psicólogo não encontrado' });
        }
        res.json(psicologo);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// DELETE /api/psicologos/:id — delete psicologo
router.delete('/:id', verifyToken, verifyTokenByRole('admin'), async (req: Request, res: Response) => {
    try {
        const psicologo = await Psicologo.findByIdAndDelete(req.params['id']);
        if (!psicologo) {
            return res.status(404).json({ error: 'Psicólogo não encontrado' });
        }
        res.json({ message: 'Psicólogo removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { psicologoRoutes: router };
