const express = require('express');
const router = express.Router();
const User = require('../models/user');

// register user
router.post('/register', async (req: any, res: any) => {
    try {
        const { nome, genero, data_nascimento, email, password, tipo } = req.body;
        const user = new User({ nome, genero, data_nascimento, email, password, tipo });
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
            return res.status(404).json({ error: 'User not found' });
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
        const user = await User.findOne({ email, password });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const safeUser = user.toObject();
        delete safeUser.password;

        res.json({ user: safeUser });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { userRoutes: router };