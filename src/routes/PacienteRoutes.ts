import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express  = require('express');
const router   = express.Router();
const Paciente = require('../models/paciente');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/pacientes — create paciente profile ────────────────────────────
// Psicologo only. The psicologo field is auto-filled from the logged-in psicologo.
// The body must supply `user` (the paciente's User._id).
router.post('/', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }
        const { user, doenca, formulario } = req.body;
        // psicologo is always the logged-in psicologo — never trusted from body
        const paciente = new Paciente({ user, psicologo: psicologoProfile._id, doenca, formulario });
        await paciente.save();
        res.status(201).json(paciente);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes — scoped list ─────────────────────────────────────────
// Psicologo: only their assigned pacientes.
// Paciente: only their own profile (returned as an array for consistency).
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            const pacientes = await Paciente.find({ psicologo: psicologoProfile._id })
                .populate('user', '-password')
                .populate('psicologo');
            return res.json(pacientes);
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile) {
                return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
            }
            const paciente = await Paciente.findById(pacienteProfile._id)
                .populate('user', '-password')
                .populate('psicologo');
            return res.json([paciente]);
        }
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes/psicologo/:psicologoId — pacientes of a psicologo ─────
// Only the psicologo who owns that profile can access.
// Must come before /:id to avoid route conflict.
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { psicologoId } = req.params;
        if (!isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
            return res.status(403).json({ error: 'Acesso negado: não pode ver pacientes de outro psicólogo' });
        }

        const pacientes = await Paciente.find({ psicologo: psicologoId })
            .populate('user', '-password')
            .populate('psicologo');
        res.json(pacientes);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes/:id — get paciente by id ──────────────────────────────
// Paciente: only their own profile.
// Psicologo: only if that paciente is assigned to them.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== id) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver o perfil de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, id);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        const paciente = await Paciente.findById(id)
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

// ─── PUT /api/pacientes/:id — update paciente ─────────────────────────────────
// Only the assigned psicologo can update clinical/profile data.
// Prevents changing `user` or `psicologo` ownership fields.
router.put('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        const assigned = await isPsicologoAssignedToPaciente(req.user!.id, id);
        if (!assigned) {
            return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
        }

        // Strip ownership fields from body
        const { user: _u, psicologo: _ps, ...safeBody } = req.body;
        void _u; void _ps;

        const paciente = await Paciente.findByIdAndUpdate(id, safeBody, { new: true, runValidators: true })
            .populate('user', '-password')
            .populate('psicologo');
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        res.json(paciente);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/pacientes/:id — disabled ─────────────────────────────────────
// No admin role implemented. Operation not permitted.
router.delete('/:id', verifyToken, (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Operação não permitida' });
});

module.exports = { pacienteRoutes: router };
