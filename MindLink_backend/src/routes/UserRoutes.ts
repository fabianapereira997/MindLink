import { Request, Response } from 'express';
import { isValidObjectId, isTodayOrPast, isWithinMaxAge, isValidEmail, isValidDate, isValidPassword } from '../utils/helpers';

const express   = require('express');
const router    = express.Router();
const User      = require('../models/user');
const Paciente  = require('../models/paciente');
const Psicologo = require('../models/psicologo');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { verifyToken } = require('../middleware/VerifyToken');

// ─── POST /api/users/register — admin self-registration only ──────────────────
// Only users with tipo='admin' may register here. Requires a secret adminToken
// that must match the ADMIN_REGISTER_TOKEN environment variable.
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { nome, genero, data_nascimento, email, password, tipo, adminToken } = req.body;

        // Only admin may self-register via the public site
        if (tipo !== 'admin') {
            return res.status(403).json({ error: 'Auto-registo apenas disponível para administradores' });
        }

        // Validate the secret admin token
        if (!adminToken || adminToken !== process.env.ADMIN_REGISTER_TOKEN) {
            return res.status(403).json({ error: 'Token de validação inválido' });
        }

        if (!nome || !genero || !email || !password || !data_nascimento) {
            return res.status(400).json({ error: 'Nome, género, email, password e data de nascimento são obrigatórios' });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ error: 'A password deve ter pelo menos 6 caracteres e incluir um número' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Formato de email inválido' });
        }

        if (!isValidDate(data_nascimento)) {
            return res.status(400).json({ error: 'Data de nascimento inválida' });
        }

        if (!isTodayOrPast(data_nascimento)) {
            return res.status(400).json({ error: 'A data de nascimento não pode ser uma data futura' });
        }

        if (!isWithinMaxAge(data_nascimento)) {
            return res.status(400).json({ error: 'A idade não pode exceder 120 anos' });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ error: 'Email já registado' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({ nome, genero, data_nascimento, email, password: hashedPassword, tipo: 'admin' });
        await user.save();

        const safeUser = user.toObject();
        delete safeUser.password;
        res.status(201).json(safeUser);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── POST /api/users/login — public ───────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Email ou password incorretos' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Email ou password incorretos' });
        }

        // Pacientes e psicólogos inativos não podem entrar na plataforma.
        if (user.tipo === 'paciente') {
            const paciente = await Paciente.findOne({ user: user._id });
            if (paciente && paciente.ativo === false) {
                return res.status(403).json({
                    error: 'A sua conta encontra-se atualmente desativada. Por favor contacte a sua clínica associada.',
                });
            }
        }

        if (user.tipo === 'psicologo') {
            const psicologo = await Psicologo.findOne({ user: user._id });
            if (psicologo && psicologo.ativo === false) {
                return res.status(403).json({
                    error: 'A sua conta encontra-se atualmente desativada. Por favor contacte a sua clínica associada.',
                });
            }
        }

        const token = jwt.sign(
            { id: user._id, tipo: user.tipo },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' }
        );

        const safeUser = user.toObject();
        delete safeUser.password;
        res.json({ token, user: safeUser });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/users — returns only the logged-in user's own data ───────────────
// Not public. A user may only see their own record.
router.get('/', verifyToken, async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.user!.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'Utilizador não encontrado' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/users/:id — authenticated; user may only view their own record ──
router.get('/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de utilizador inválido' });
        }
        if (id !== req.user!.id) {
            return res.status(403).json({ error: 'Acesso negado: não pode ver dados de outro utilizador' });
        }
        const user = await User.findById(id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'Utilizador não encontrado' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/users/:id — user may only update their own record ────────────────
// `tipo` is stripped from the body to prevent role escalation.
router.put('/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de utilizador inválido' });
        }
        if (id !== req.user!.id) {
            return res.status(403).json({ error: 'Acesso negado: não pode editar dados de outro utilizador' });
        }

        // Strip sensitive/protected fields from the body
        const { password: _pw, tipo: _tipo, ...safeBody } = req.body;
        void _pw; void _tipo;

        if (safeBody.email !== undefined && !isValidEmail(safeBody.email)) {
            return res.status(400).json({ error: 'Formato de email inválido' });
        }

        if (safeBody.data_nascimento !== undefined && !isValidDate(safeBody.data_nascimento)) {
            return res.status(400).json({ error: 'Data de nascimento inválida' });
        }

        if (safeBody.data_nascimento !== undefined && !isTodayOrPast(safeBody.data_nascimento)) {
            return res.status(400).json({ error: 'A data de nascimento não pode ser uma data futura' });
        }

        if (safeBody.data_nascimento !== undefined && !isWithinMaxAge(safeBody.data_nascimento)) {
            return res.status(400).json({ error: 'A idade não pode exceder 120 anos' });
        }

        // Hash new password if provided
        if (req.body.password) {
            if (!isValidPassword(req.body.password)) {
                return res.status(400).json({ error: 'A password deve ter pelo menos 6 caracteres e incluir um número' });
            }
            safeBody.password = await bcrypt.hash(req.body.password, 12);
        }

        const user = await User.findByIdAndUpdate(id, safeBody, { new: true, runValidators: true }).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'Utilizador não encontrado' });
        }
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── POST /api/users/change-password — authenticated; change own password ─────
// Clears mustChangePassword flag after a successful update.
router.post('/change-password', verifyToken, async (req: Request, res: Response) => {
    try {
        const { newPassword } = req.body;
        if (!isValidPassword(newPassword)) {
            return res.status(400).json({ error: 'A nova password deve ter pelo menos 6 caracteres e incluir um número' });
        }
        const hashed = await bcrypt.hash(newPassword, 12);
        const user = await User.findByIdAndUpdate(
            req.user!.id,
            { password: hashed, mustChangePassword: false },
            { new: true }
        ).select('-password');
        if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/users/:id — disabled ─────────────────────────────────────────
// Not available without an admin role. Returns 403 for all requests.
router.delete('/:id', verifyToken, (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Operação não permitida' });
});

module.exports = { userRoutes: router };
