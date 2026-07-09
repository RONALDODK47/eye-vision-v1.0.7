import { mkdirSync, writeFileSync } from 'fs';
import { buildDominioPlanoTxt, buildDominioRazaoTxt } from '../src/contabilfacil/__tests__/fixtures/dominioFixtures';

mkdirSync('e2e/fixtures', { recursive: true });
writeFileSync('e2e/fixtures/plano-dominio.txt', buildDominioPlanoTxt());
writeFileSync('e2e/fixtures/razao-dominio.txt', buildDominioRazaoTxt(420));
console.log('Fixtures gerados em e2e/fixtures/');
