import { Request, Response } from 'express';
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/users/register — create a new user
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { nome, genero, data_nascimento, email, password, tipo } = req.body;

        // check for duplicate email
        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ error: 'Email já registado' });
        }

        // hash password before saving
        const hashedPassword = await bcrypt.hash(password, 12);

        const user = new User({ nome, genero, data_nascimento, email, password: hashedPassword, tipo });
        await user.save();

        const safeUser = user.toObject();
        delete safeUser.password;

        res.status(201).json(safeUser);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// GET /api/users — list all users (passwords excluded)
router.get('/', async (_req: Request, res: Response) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/users/:id — get user by id
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.params['id']).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'Utilizador não encontrado' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/users/login — authenticate and return JWT
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Email ou password incorretos' });
        }

        // compare password with stored hash
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Email ou password incorretos' });
        }

        // sign JWT with id and tipo
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

module.exports = { userRoutes: router };
