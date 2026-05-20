const express = require('express');
const router = express.Router();
const Paciente = require('../models/paciente');
const { verifyToken } = require('../auth/VerifyToken');
const { verifyTokenByRole } = require('../auth/VerifyTokenByRole');

// POST /api/pacientes — create paciente profile
router.post('/', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: any, res: any) => {
    try {
        const { user, psicologo, doenca, formulario } = req.body;
        const paciente = new Paciente({ user, psicologo, doenca, formulario });
        await paciente.save();
        res.status(201).json(paciente);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// GET /api/pacientes — list all pacientes
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: any, res: any) => {
    try {
        const pacientes = await Paciente.find()
            .populate('user', '-password')
            .populate('psicologo');
        res.json(pacientes);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/pacientes/psicologo/:psicologoId — get all pacientes of a psicologo
// (must come before /:id to avoid route conflict)
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: any, res: any) => {
    try {
        const pacientes = await Paciente.find({ psicologo: req.params.psicologoId })
            .populate('user', '-password')
            .populate('psicologo');
        res.json(pacientes);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/pacientes/:id — get paciente by id
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: any, res: any) => {
    try {
        const paciente = await Paciente.findById(req.params.id)
            .populate('user', '-password')
            .populate('psicologo');
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        res.json(paciente);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PUT /api/pacientes/:id — update paciente
router.put('/:id', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: any, res: any) => {
    try {
        const paciente = await Paciente.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('user', '-password');
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        res.json(paciente);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// DELETE /api/pacientes/:id — delete paciente
router.delete('/:id', verifyToken, verifyTokenByRole('admin'), async (req: any, res: any) => {
    try {
        const paciente = await Paciente.findByIdAndDelete(req.params.id);
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        res.json({ message: 'Paciente removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { pacienteRoutes: router };
