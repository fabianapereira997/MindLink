import mongoose = require('mongoose');
require('dotenv').config();
const Psicologo = require('../src/models/psicologo');

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  const psicologos = await Psicologo.find().populate('user', 'nome email');
  psicologos.forEach((p: any) => console.log(p._id.toString(), p.user?.nome, p.user?.email));
  await mongoose.disconnect();
}
main();
