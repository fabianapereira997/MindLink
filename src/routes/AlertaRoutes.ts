import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express = require('express');
const router  = express.Router();
const Alerta  = require('../models/alerta');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/alertas (dev/testing only) ─────────────────────────────────────
// In production, alerts are created by AnaliseRoutes. This endpoint is for
// manual testing and admin use only.
router.post('/', verifyToken, verifyTokenByRole('admin'), async (req: Request, res: Response) => {
    try {
        const alerta = new Alerta(req.body);
        await alerta.save();
        res.status(201).json(alerta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/alertas/paciente/:pacienteId ─────────────────────────────────────
// Paciente: only their own. Psicologo: only if that paciente is assigned to them.
// Must come before /:id.
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('paciente', 'psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { pacienteId } = req.params;
        if (!isValidObjectId(pacienteId)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== pacienteId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver alertas de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pacienteId);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
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

// ─── GET /api/alertas/psicologo/:psicologoId ──────────────────────────────────
// Psicologo: only if :psicologoId matches their own profile.
// Returns all alertas where psicologo === psicologoId.
// Must come before /:id.
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { psicologoId } = req.params;
        if (!isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver alertas de outro psicólogo' });
            }
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

// ─── PATCH /api/alertas/:id/lido ──────────────────────────────────────────────
// Paciente: can mark their own alerta as lido.
// Psicologo: can mark an alerta as lido only if it belongs to one of their pacientes.
// Must come before /:id.
router.patch('/:id/lido', verifyToken, verifyTokenByRole('paciente', 'psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de alerta inválido' });
        }

        const alerta = await Alerta.findById(id);
        if (!alerta) {
            return res.status(404).json({ error: 'Alerta não encontrado' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || alerta.paciente.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || alerta.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este psicólogo' });
            }
        }

        alerta.lido = true;
        await alerta.save();
        res.json(alerta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/alertas/:id ──────────────────────────────────────────────────────
// Paciente: only their own. Psicologo: only if they are the assigned psicologo.
router.get('/:id', verifyToken, verifyTokenByRole('paciente', 'psicologo', 'admin'), async (req: Request, res: Response) => {
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

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || alerta.paciente._id.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || alerta.psicologo._id.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este psicólogo' });
            }
        }

        res.json(alerta);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/alertas/:id ───────────────────────────────────────────────────
// Psicologo: only if alerta belongs to one of their pacientes.
// Admin: any.
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de alerta inválido' });
        }

        const alerta = await Alerta.findById(id);
        if (!alerta) {
            return res.status(404).json({ error: 'Alerta não encontrado' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || alerta.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: alerta não pertence a este psicólogo' });
            }
        }

        await Alerta.findByIdAndDelete(id);
        res.json({ message: 'Alerta removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { alertaRoutes: router };
