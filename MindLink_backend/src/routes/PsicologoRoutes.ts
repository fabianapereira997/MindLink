import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isValidObjectId,
} from '../utils/helpers';

const express    = require('express');
const router     = express.Router();
const Psicologo  = require('../models/psicologo');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/psicologos — create own psicologo profile ──────────────────────
// Psicologo only. `user` is auto-filled from the logged-in user to prevent
// creating a profile on behalf of someone else.
router.post('/', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { especialidade } = req.body;
        // user must always match the authenticated user — never trusted from body
        const psicologo = new Psicologo({ user: req.user!.id, especialidade });
        await psicologo.save();
        res.status(201).json(psicologo);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/psicologos/associado — paciente retrieves their own psicologo ───
// Paciente only. Returns only the psicologo assigned to the logged-in paciente.
// Must come before /:id to avoid route conflict.
router.get('/associado', verifyToken, verifyTokenByRole('paciente'), async (req: Request, res: Response) => {
    try {
        const pacienteProfile = await getPacienteByUserId(req.user!.id);
        if (!pacienteProfile) {
            return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
        }
        const psicologo = await Psicologo.findById(pacienteProfile.psicologo).populate('user', '-password');
        if (!psicologo) {
            return res.status(404).json({ error: 'Psicólogo associado não encontrado' });
        }
        res.json(psicologo);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/psicologos — list all psicologos ────────────────────────────────
// Psicologo only. Pacientes must not access this list.
router.get('/', verifyToken, verifyTokenByRole('psicologo'), async (_req: Request, res: Response) => {
    try {
        const psicologos = await Psicologo.find().populate('user', '-password');
        res.json(psicologos);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/psicologos/:id — get psicologo by id ────────────────────────────
// Psicologo: only their own profile.
// Paciente: only their assigned psicologo.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || psicologoProfile._id.toString() !== id) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver o perfil de outro psicólogo' });
            }
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile.psicologo.toString() !== id) {
                return res.status(403).json({ error: 'Acesso negado: psicólogo não associado ao seu perfil' });
            }
        }

        const psicologo = await Psicologo.findById(id).populate('user', '-password');
        if (!psicologo) {
            return res.status(404).json({ error: 'Psicólogo não encontrado' });
        }
        res.json(psicologo);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/psicologos/:id — update own psicologo profile ───────────────────
// Psicologo only. Must own the profile.
router.put('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || psicologoProfile._id.toString() !== id) {
            return res.status(403).json({ error: 'Acesso negado: não pode editar o perfil de outro psicólogo' });
        }

        // Prevent changing the linked user account
        const { user: _u, ...safeBody } = req.body;
        void _u;

        const psicologo = await Psicologo.findByIdAndUpdate(id, safeBody, { new: true, runValidators: true })
            .populate('user', '-password');
        if (!psicologo) {
            return res.status(404).json({ error: 'Psicólogo não encontrado' });
        }
        res.json(psicologo);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/psicologos/:id — disabled ────────────────────────────────────
// No admin role implemented. Operation not permitted.
router.delete('/:id', verifyToken, (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Operação não permitida' });
});

module.exports = { psicologoRoutes: router };
