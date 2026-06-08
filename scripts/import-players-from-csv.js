/**
 * Script to import players from CSV file and generate TypeScript code
 * Run with: node scripts/import-players-from-csv.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = 'C:\\Users\\Dell\\Downloads\\Football Player Stats (1).csv';
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'services', 'mockAIService.ts');

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Parse header
  const headers = lines[0].split(';').map(h => h.trim());
  
  // Parse data rows
  const players = [];
  let playerId = 1;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    if (values.length < headers.length) continue;
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });
    
    // Skip if essential fields are missing
    if (!row.Player || !row.Age) continue;
    
    // Map CSV columns to PlayerData format
    const player = {
      id: `p${playerId++}`,
      name: row.Player,
      age: parseInt(row.Age) || 25,
      position: mapPosition(row.Pos),
      team: row.Squad || 'Unknown',
      nationality: row.Nation || 'Unknown',
      comp: row.Comp || 'Unknown',
      stats: {
        matches: parseInt(row.MP) || 0,
        goals: parseFloat(row.Goals) || 0,
        assists: parseFloat(row.Assists) || 0,
        minutesPlayed: parseInt(row.Min) || 0,
        injuries: Math.floor(Math.random() * 3), // Not in CSV, random for now
      },
      physical: {
        height: Math.floor(Math.random() * 20) + 170, // Not in CSV, random for now
        weight: Math.floor(Math.random() * 20) + 70, // Not in CSV, random for now
        sprintSpeed: Math.floor(Math.random() * 30) + 70, // Not in CSV, random for now
        stamina: Math.floor(Math.random() * 30) + 70, // Not in CSV, random for now
        strength: Math.floor(Math.random() * 30) + 70, // Not in CSV, random for now
      },
      // Additional fields from CSV that might be useful
      csvData: {
        '90s': parseFloat(row['90s']) || 0,
        comp: row.Comp || 'Unknown',
      }
    };
    
    players.push(player);
  }
  
  return players;
}

function mapPosition(pos) {
  if (!pos) return 'Midfielder';
  
  const posUpper = pos.toUpperCase();
  if (posUpper.includes('FW') || posUpper.includes('FORWARD')) return 'Forward';
  if (posUpper.includes('MF') || posUpper.includes('MIDFIELD')) return 'Midfielder';
  if (posUpper.includes('DF') || posUpper.includes('DEFEND')) return 'Defender';
  if (posUpper.includes('GK') || posUpper.includes('GOALKEEP')) return 'Goalkeeper';
  
  return 'Midfielder'; // Default
}

function generateTypeScript(players) {
  // Read the existing file to preserve other exports
  const existingFile = fs.readFileSync(OUTPUT_PATH, 'utf-8');
  
  // Find the mockPlayers array and replace it
  const startMarker = 'export const mockPlayers: PlayerData[] = [';
  const endMarker = '];';
  
  const startIndex = existingFile.indexOf(startMarker);
  const endIndex = existingFile.indexOf(endMarker, startIndex);
  
  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Could not find mockPlayers array in file');
  }
  
  const before = existingFile.substring(0, startIndex + startMarker.length);
  const after = existingFile.substring(endIndex);
  
  const playersCode = players.map(p => {
    return `  ${JSON.stringify(p, null, 2).split('\n').join('\n  ')}`;
  }).join(',\n');
  
  return before + '\n' + playersCode + '\n' + after;
}

// Read CSV file
console.log('Reading CSV file...');
const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');

console.log('Parsing CSV...');
const players = parseCSV(csvContent);

console.log(`Parsed ${players.length} players`);

// Generate TypeScript code
console.log('Generating TypeScript code...');
const tsCode = generateTypeScript(players);

// Write to file
console.log(`Writing to ${OUTPUT_PATH}...`);
fs.writeFileSync(OUTPUT_PATH, tsCode, 'utf-8');

console.log(`✅ Successfully imported ${players.length} players!`);
console.log(`   Output file: ${OUTPUT_PATH}`);
