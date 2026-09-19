#!/usr/bin/env node
'use strict';
/**
 * Crée un compte d'administration de la console.
 *
 *   node creer-admin.js <identifiant> ["Nom affiché"]
 *
 * Le mot de passe est saisi sans écho et ne passe jamais par la ligne de
 * commande : un argument serait visible dans le `ps` de tout le monde, et
 * resterait dans l'historique du shell.
 */

const readline = require('readline');
const { creerAdministrateur, lireComptes } = require('./auth');

const identifiant = process.argv[2];
const nom = process.argv[3];

if (!identifiant || !/^[a-z_][a-z0-9_.-]{0,30}$/.test(identifiant)) {
  console.error('Usage : node creer-admin.js <identifiant> ["Nom affiché"]');
  console.error('        identifiant : minuscules, chiffres, . _ -');
  process.exit(1);
}

function demander(invite) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const surDonnees = (c) => {
      // Masque la frappe, sauf les touches de contrôle.
      if (['\n', '\r', ''].includes(c.toString())) process.stdin.removeListener('data', surDonnees);
    };
    process.stdin.on('data', surDonnees);
    rl.question(invite, (reponse) => {
      rl.close();
      process.stdout.write('\n');
      resolve(reponse);
    });
    rl._writeToOutput = () => rl.output.write('');
  });
}

(async () => {
  const existe = !!lireComptes()[identifiant];
  if (existe) console.log(`Le compte « ${identifiant} » existe : son mot de passe va être remplacé.`);

  const mdp = await demander('Mot de passe : ');
  if (mdp.length < 12) {
    console.error('Mot de passe trop court : 12 caractères minimum.');
    process.exit(1);
  }
  const confirmation = await demander('Confirmation : ');
  if (mdp !== confirmation) {
    console.error('Les deux saisies diffèrent.');
    process.exit(1);
  }

  const compte = creerAdministrateur(identifiant, mdp, nom);
  console.log(`Compte ${existe ? 'mis à jour' : 'créé'} : ${compte.identifiant} (${compte.nom})`);
})();
