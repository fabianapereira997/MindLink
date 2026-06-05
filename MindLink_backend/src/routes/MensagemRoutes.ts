import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express  = require('express');
const router   = express.Router();
const Mensagem = require('../models/mensagem');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/mensagens ───────────────────────────────────────────────────────
// Paciente: auto-fill paciente from profile; psicologo derived from paciente.psicologo.
// Psicologo: auto-fill psicologo from profile; body must supply paciente ID.
// remetente is always derived from the authenticated user — never trusted from body.
router.post('/', verifyToken, verifyTokenByRole('paciente', 'psicologo'), async (req: Request, res: Response) => {
    try {
        const { mensagem } = req.body;

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile) {
                return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
            }
            const msg = new Mensagem({
                paciente:  pacienteProfile._id,
                psicologo: pacienteProfile.psicologo,   // auto-derived
                remetente: 'paciente',                  // never trusted from body
                mensagem,
            });
            await msg.save();
            return res.status(201).json(msg);
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }

            const { paciente: pacienteId } = req.body;
            if (!pacienteId || !isValidObjectId(pacienteId)) {
                return res.status(400).json({ error: 'ID de paciente inválido ou em falta' });
            }

            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pacienteId);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }

            const msg = new Mensagem({
                paciente:  pacienteId,
                psicologo: psicologoProfile._id,        // auto-filled
                remetente: 'psicologo',                 // never trusted from body
                mensagem,
            });
            await msg.save();
            return res.status(201).json(msg);
        }
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/mensagens/conversa/:pacienteId/:psicologoId ─────────────────────
// Returns the full conversation between a paciente and a psicologo, sorted oldest first.
// Paciente: :pacienteId must match their profile; :psicologoId must be their assigned psicologo.
// Psicologo: :psicologoId must match their profile; :pacienteId must be one of their patients.
// Must come before /:id.
router.get('/conversa/:pacienteId/:psicologoId', verifyToken, verifyTokenByRole('paciente', 'psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { pacienteId, psicologoId } = req.params;

        if (!isValidObjectId(pacienteId) || !isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== pacienteId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver conversa de outro paciente' });
            }
            // verify the psicologoId is their assigned psicologo
            if (pacienteProfile.psicologo.toString() !== psicologoId) {
                return res.status(403).json({ error: 'Acesso negado: psicólogo não corresponde ao perfil' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver conversa de outro psicólogo' });
            }
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pacienteId);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        const mensagens = await Mensagem.find({ paciente: pacienteId, psicologo: psicologoId })
            .sort({ data: 1 });
        res.json(mensagens);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/mensagens/:id ────────────────────────────────────────────────────
// Accessible to the paciente or psicologo who is part of the conversation.
router.get('/:id', verifyToken, verifyTokenByRole('paciente', 'psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de mensagem inválido' });
        }

        const msg = await Mensagem.findById(id);
        if (!msg) {
            return res.status(404).json({ error: 'Mensagem não encontrada' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || msg.paciente.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || msg.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado' });
            }
        }

        res.json(msg);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/mensagens/:id ────────────────────────────────────────────────────
// Only the original sender can edit their own message.
router.put('/:id', verifyToken, verifyTokenByRole('paciente', 'psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de mensagem inválido' });
        }

        const msg = await Mensagem.findById(id);
        if (!msg) {
            return res.status(404).json({ error: 'Mensagem não encontrada' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || msg.remetente !== 'paciente' || msg.paciente.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: só pode editar as suas próprias mensagens' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || msg.remetente !== 'psicologo' || msg.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: só pode editar as suas próprias mensagens' });
            }
        }

        msg.mensagem = req.body.mensagem ?? msg.mensagem;
        await msg.save();
        res.json(msg);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/mensagens/:id ─────────────────────────────────────────────────
// Only the original sender can delete their own message.
router.delete('/:id', verifyToken, verifyTokenByRole('paciente', 'psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de mensagem inválido' });
        }

        const msg = await Mensagem.findById(id);
        if (!msg) {
            return res.status(404).json({ error: 'Mensagem não encontrada' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || msg.remetente !== 'paciente' || msg.paciente.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: só pode eliminar as suas próprias mensagens' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || msg.remetente !== 'psicologo' || msg.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: só pode eliminar as suas próprias mensagens' });
            }
        }

        await Mensagem.findByIdAndDelete(id);
        res.json({ message: 'Mensagem eliminada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { mensagemRoutes: router };
