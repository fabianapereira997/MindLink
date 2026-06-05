import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express = require('express');
const router  = express.Router();
const Alerta  = require('../models/alerta');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/alertas — disabled ─────────────────────────────────────────────
// Alertas are created exclusively by the analysis engine (AnaliseRoutes).
// Manual creation is not permitted.
router.post('/', verifyToken, (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Alertas são criados automaticamente pelo sistema de análise' });
});

// ─── GET /api/alertas/paciente/:pacienteId — alertas for a paciente ───────────
// Psicologo only: only if that paciente is assigned to them.
// Paciente must NOT access alertas — these are clinical notifications for the psicologo.
// Must come before /:id to avoid route conflict.
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { pacienteId } = req.params;
        if (!isValidObjectId(pacienteId)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pacienteId);
        if (!assigned) {
            return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
        }

        const alertas = await Alerta.find({ paciente: pacienteId })
            .populate('paciente')
            .populate('psicologo')
            .sort({ createdAt: -1 });
        res.json(alertas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/alertas/psicologo/:psicologoId — alertas for a psicologo ────────
// Psicologo only: only if :psicologoId matches their own profile.
// Must come before /:id to avoid route conflict.
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { psicologoId } = req.params;
        if (!isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
            return res.status(403).json({ error: 'Acesso negado: não pode ver alertas de outro psicólogo' });
        }

        const alertas = await Alerta.find({ psicologo: psicologoId })
            .populate('paciente')
            .populate('psicologo')
            .sort({ createdAt: -1 });
        res.json(alertas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PATCH /api/alertas/:id/lido — mark alerta as read ────────────────────────
// Psicologo only: only for alertas belonging to their assigned pacientes.
// Paciente must NOT mark alertas as read — lido tracks psicologo acknowledgement.
// Must come before /:id to avoid route conflict.
router.patch('/:id/lido', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de alerta inválido' });
        }

        const alerta = await Alerta.findById(id);
        if (!alerta) {
            return res.status(404).json({ error: 'Alerta não encontrado' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || alerta.psicologo.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este psicólogo' });
        }

        alerta.lido = true;
        await alerta.save();
        res.json(alerta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/alertas/:id — get alerta by id ──────────────────────────────────
// Psicologo only: only if they are the assigned psicologo for this alerta.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de alerta inválido' });
        }

        const alerta = await Alerta.findById(id)
            .populate('paciente')
            .populate('psicologo');
        if (!alerta) {
            return res.status(404).json({ error: 'Alerta não encontrado' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || alerta.psicologo._id.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este psicólogo' });
        }

        res.json(alerta);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/alertas/:id — psicologo only, must own the alerta ────────────
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de alerta inválido' });
        }

        const alerta = await Alerta.findById(id);
        if (!alerta) {
            return res.status(404).json({ error: 'Alerta não encontrado' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || alerta.psicologo.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este psicólogo' });
        }

        await Alerta.findByIdAndDelete(id);
        res.json({ message: 'Alerta removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { alertaRoutes: router };
