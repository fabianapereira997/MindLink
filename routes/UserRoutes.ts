const express = require('express');
const router = express.Router();
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// register user
router.post('/register', async (req: any, res: any) => {
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

// get all users
router.get('/', async (req: any, res: any) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// get user by id
router.get('/:id', async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'Utilizador não encontrado' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// login user
router.post('/login', async (req: any, res: any) => {
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