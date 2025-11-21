// 🎯 LISTA PRIORIZADA DE MUNICIPIOS PARA ENRIQUECIMIENTO
// Ordenados por importancia turística y categoría
// Status: 'done' = ya tenemos datos, 'pending' = pendiente de procesar

export const PRIORITY_MUNICIPALITIES = [
  // ============================================
  // 🏖️ COSTA BRAVA - MÁXIMA PRIORIDAD
  // ============================================
  { code: '170950', name: 'Lloret de Mar', comarca: 'Selva', category: 'costa', priority: 1, status: 'done' },
  { code: '171523', name: 'Roses', comarca: 'Alt Empordà', category: 'costa', priority: 1, status: 'done' },
  { code: '172023', name: 'Tossa de Mar', comarca: 'Selva', category: 'costa', priority: 1, status: 'done' },
  { code: '170329', name: 'Cadaqués', comarca: 'Alt Empordà', category: 'costa', priority: 1, status: 'done' },
  { code: '170486', name: "Platja d'Aro", comarca: 'Baix Empordà', category: 'costa', priority: 1, status: 'done' },
  { code: '170237', name: 'Blanes', comarca: 'Selva', category: 'costa', priority: 1, status: 'done' },
  { code: '170854', name: "L'Escala", comarca: 'Alt Empordà', category: 'costa', priority: 1, status: 'done' },
  { code: '171609', name: 'Sant Feliu de Guíxols', comarca: 'Baix Empordà', category: 'costa', priority: 1, status: 'done' },
  { code: '171181', name: 'Palamós', comarca: 'Baix Empordà', category: 'costa', priority: 1, status: 'done' },
  { code: '171404', name: 'El Port de la Selva', comarca: 'Alt Empordà', category: 'costa', priority: 1, status: 'done' },
  // Pendientes Costa Brava
  { code: '170124', name: 'Begur', comarca: 'Baix Empordà', category: 'costa', priority: 1, status: 'pending' },
  { code: '171171', name: 'Palafrugell', comarca: 'Baix Empordà', category: 'costa', priority: 1, status: 'pending' },
  { code: '170889', name: 'Empuriabrava', comarca: 'Alt Empordà', category: 'costa', priority: 1, status: 'pending' },
  { code: '171042', name: 'Llançà', comarca: 'Alt Empordà', category: 'costa', priority: 2, status: 'pending' },
  { code: '171682', name: 'Sant Pere Pescador', comarca: 'Alt Empordà', category: 'costa', priority: 2, status: 'pending' },
  { code: '170524', name: 'Calonge', comarca: 'Baix Empordà', category: 'costa', priority: 2, status: 'pending' },
  { code: '171289', name: 'Portbou', comarca: 'Alt Empordà', category: 'costa', priority: 3, status: 'pending' },
  { code: '170673', name: 'Colera', comarca: 'Alt Empordà', category: 'costa', priority: 3, status: 'pending' },

  // ============================================
  // 🏖️ COSTA DORADA - MÁXIMA PRIORIDAD
  // ============================================
  { code: '439057', name: 'Salou', comarca: 'Tarragonès', category: 'costa', priority: 1, status: 'done' },
  { code: '430385', name: 'Cambrils', comarca: 'Baix Camp', category: 'costa', priority: 1, status: 'done' },
  { code: '431634', name: 'El Vendrell', comarca: 'Baix Penedès', category: 'costa', priority: 1, status: 'done' },
  { code: '430379', name: 'Calafell', comarca: 'Baix Penedès', category: 'costa', priority: 1, status: 'done' },
  // Pendientes Costa Dorada
  { code: '430823', name: 'Miami Platja (Mont-roig)', comarca: 'Baix Camp', category: 'costa', priority: 1, status: 'pending' },
  { code: '430788', name: "L'Ametlla de Mar", comarca: 'Baix Ebre', category: 'costa', priority: 2, status: 'pending' },
  { code: '431578', name: 'Torredembarra', comarca: 'Tarragonès', category: 'costa', priority: 2, status: 'pending' },
  { code: '430033', name: 'Altafulla', comarca: 'Tarragonès', category: 'costa', priority: 2, status: 'pending' },
  { code: '430467', name: 'Coma-ruga (El Vendrell)', comarca: 'Baix Penedès', category: 'costa', priority: 2, status: 'pending' },
  { code: '430307', name: 'Creixell', comarca: 'Tarragonès', category: 'costa', priority: 3, status: 'pending' },

  // ============================================
  // 🏖️ COSTA MARESME - ALTA PRIORIDAD
  // ============================================
  { code: '80060', name: 'Arenys de Mar', comarca: 'Maresme', category: 'costa', priority: 2, status: 'done' },
  { code: '80403', name: 'Canet de Mar', comarca: 'Maresme', category: 'costa', priority: 2, status: 'done' },
  { code: '80327', name: "Caldes d'Estrac", comarca: 'Maresme', category: 'costa', priority: 2, status: 'done' },
  // Pendientes Maresme
  { code: '81690', name: 'Pineda de Mar', comarca: 'Maresme', category: 'costa', priority: 2, status: 'pending' },
  { code: '81521', name: 'Malgrat de Mar', comarca: 'Maresme', category: 'costa', priority: 2, status: 'pending' },
  { code: '82630', name: 'Santa Susanna', comarca: 'Maresme', category: 'costa', priority: 2, status: 'pending' },
  { code: '80375', name: 'Calella', comarca: 'Maresme', category: 'costa', priority: 2, status: 'pending' },
  { code: '82346', name: 'Sant Pol de Mar', comarca: 'Maresme', category: 'costa', priority: 3, status: 'pending' },
  { code: '81749', name: 'Premià de Mar', comarca: 'Maresme', category: 'costa', priority: 3, status: 'pending' },

  // ============================================
  // 🏖️ COSTA GARRAF - ALTA PRIORIDAD
  // ============================================
  { code: '82704', name: 'Sitges', comarca: 'Garraf', category: 'costa', priority: 1, status: 'done' },
  { code: '80569', name: 'Castelldefels', comarca: 'Baix Llobregat', category: 'costa', priority: 2, status: 'done' },
  // Pendientes Garraf
  { code: '82895', name: 'Vilanova i la Geltrú', comarca: 'Garraf', category: 'costa', priority: 2, status: 'pending' },
  { code: '80789', name: 'Cubelles', comarca: 'Garraf', category: 'costa', priority: 3, status: 'pending' },

  // ============================================
  // 🏔️ PIRINEOS - ALTA PRIORIDAD (ESQUÍ)
  // ============================================
  { code: '252430', name: 'Vielha e Mijaran', comarca: "Val d'Aran", category: 'montaña', priority: 1, status: 'done' },
  { code: '171411', name: 'Puigcerdà', comarca: 'Cerdanya', category: 'montaña', priority: 1, status: 'done' },
  { code: '170062', name: 'Alp', comarca: 'Cerdanya', category: 'montaña', priority: 1, status: 'done' },
  { code: '252038', name: "La Seu d'Urgell", comarca: 'Alt Urgell', category: 'montaña', priority: 1, status: 'done' },
  { code: '171925', name: 'Setcases', comarca: 'Ripollès', category: 'montaña', priority: 1, status: 'done' },
  { code: '170433', name: 'Queralbs', comarca: 'Ripollès', category: 'montaña', priority: 1, status: 'done' },
  { code: '80522', name: "Castellar de n'Hug", comarca: 'Berguedà', category: 'montaña', priority: 2, status: 'done' },
  { code: '80996', name: 'Guardiola de Berguedà', comarca: 'Berguedà', category: 'montaña', priority: 2, status: 'done' },
  // Pendientes Pirineos
  { code: '252014', name: 'Naut Aran', comarca: "Val d'Aran", category: 'montaña', priority: 1, status: 'pending' },
  { code: '250360', name: 'Baqueira Beret (Naut Aran)', comarca: "Val d'Aran", category: 'montaña', priority: 1, status: 'pending' },
  { code: '171066', name: 'Llívia', comarca: 'Cerdanya', category: 'montaña', priority: 1, status: 'pending' },
  { code: '170890', name: 'Masella (Alp)', comarca: 'Cerdanya', category: 'montaña', priority: 1, status: 'pending' },
  { code: '250568', name: 'Boí Taüll (Vall de Boí)', comarca: 'Alta Ribagorça', category: 'montaña', priority: 1, status: 'pending' },
  { code: '252091', name: 'Sort', comarca: 'Pallars Sobirà', category: 'montaña', priority: 2, status: 'pending' },
  { code: '250704', name: 'Espot', comarca: 'Pallars Sobirà', category: 'montaña', priority: 2, status: 'pending' },
  { code: '252165', name: 'Tavascan', comarca: 'Pallars Sobirà', category: 'montaña', priority: 2, status: 'pending' },
  { code: '251714', name: 'Rialp', comarca: 'Pallars Sobirà', category: 'montaña', priority: 2, status: 'pending' },
  { code: '171238', name: 'El Camprodon', comarca: 'Ripollès', category: 'montaña', priority: 2, status: 'pending' },
  { code: '170461', name: 'Ribes de Freser', comarca: 'Ripollès', category: 'montaña', priority: 2, status: 'pending' },
  { code: '80173', name: 'Bagà', comarca: 'Berguedà', category: 'montaña', priority: 2, status: 'pending' },
  { code: '80948', name: 'Gósol', comarca: 'Berguedà', category: 'montaña', priority: 3, status: 'pending' },
  { code: '251405', name: 'La Pobla de Segur', comarca: 'Pallars Jussà', category: 'montaña', priority: 3, status: 'pending' },

  // ============================================
  // 🏛️ CIUDADES PRINCIPALES
  // ============================================
  { code: '80193', name: 'Barcelona', comarca: 'Barcelonès', category: 'ciudad', priority: 1, status: 'done' },
  { code: '170792', name: 'Girona', comarca: 'Gironès', category: 'ciudad', priority: 1, status: 'done' },
  { code: '431482', name: 'Tarragona', comarca: 'Tarragonès', category: 'ciudad', priority: 1, status: 'done' },
  { code: '251207', name: 'Lleida', comarca: 'Segrià', category: 'ciudad', priority: 1, status: 'done' },
  { code: '431233', name: 'Reus', comarca: 'Baix Camp', category: 'ciudad', priority: 1, status: 'done' },
  { code: '81213', name: 'Mataró', comarca: 'Maresme', category: 'ciudad', priority: 2, status: 'done' },
  { code: '80155', name: 'Badalona', comarca: 'Barcelonès', category: 'ciudad', priority: 2, status: 'done' },
  { code: '170669', name: 'Figueres', comarca: 'Alt Empordà', category: 'ciudad', priority: 2, status: 'done' },
  // Pendientes Ciudades
  { code: '82798', name: 'Terrassa', comarca: 'Vallès Occidental', category: 'ciudad', priority: 2, status: 'pending' },
  { code: '82676', name: 'Sabadell', comarca: 'Vallès Occidental', category: 'ciudad', priority: 2, status: 'pending' },
  { code: '80898', name: "L'Hospitalet de Llobregat", comarca: 'Barcelonès', category: 'ciudad', priority: 2, status: 'pending' },
  { code: '81017', name: 'Granollers', comarca: 'Vallès Oriental', category: 'ciudad', priority: 3, status: 'pending' },
  { code: '81141', name: 'Manresa', comarca: 'Bages', category: 'ciudad', priority: 3, status: 'pending' },
  { code: '82634', name: 'Sant Cugat del Vallès', comarca: 'Vallès Occidental', category: 'ciudad', priority: 3, status: 'pending' },
  { code: '82178', name: 'Vic', comarca: 'Osona', category: 'ciudad', priority: 3, status: 'pending' },
  { code: '431718', name: 'Tortosa', comarca: 'Baix Ebre', category: 'ciudad', priority: 3, status: 'pending' },

  // ============================================
  // 🏛️ INTERIOR TURÍSTICO
  // ============================================
  { code: '171143', name: 'Olot', comarca: 'Garrotxa', category: 'interior', priority: 2, status: 'done' },
  { code: '171479', name: 'Ripoll', comarca: 'Ripollès', category: 'interior', priority: 2, status: 'done' },
  { code: '80469', name: 'Vilafranca del Penedès', comarca: 'Alt Penedès', category: 'interior', priority: 2, status: 'done' },
  { code: '81271', name: 'Monistrol de Montserrat', comarca: 'Bages', category: 'interior', priority: 2, status: 'done' },
  { code: '170195', name: 'Besalú', comarca: 'Garrotxa', category: 'interior', priority: 2, status: 'done' },
  { code: '171848', name: 'Santa Pau', comarca: 'Garrotxa', category: 'interior', priority: 2, status: 'done' },
  { code: '80044', name: 'Alpens', comarca: 'Osona', category: 'interior', priority: 3, status: 'done' },
  // Pendientes Interior
  { code: '81638', name: 'Montserrat (monasterio)', comarca: 'Bages', category: 'interior', priority: 1, status: 'pending' },
  { code: '82119', name: 'Sant Sadurní d\'Anoia', comarca: 'Alt Penedès', category: 'interior', priority: 2, status: 'pending' },
  { code: '170246', name: 'Banyoles', comarca: 'Pla de l\'Estany', category: 'interior', priority: 2, status: 'pending' },
  { code: '171885', name: 'Rupit i Pruit', comarca: 'Osona', category: 'interior', priority: 2, status: 'pending' },
  { code: '171904', name: 'Tavertet', comarca: 'Osona', category: 'interior', priority: 3, status: 'pending' },
  { code: '80672', name: 'Cardona', comarca: 'Bages', category: 'interior', priority: 3, status: 'pending' },
  { code: '251979', name: 'Solsona', comarca: 'Solsonès', category: 'interior', priority: 3, status: 'pending' },
  { code: '430798', name: 'Montblanc', comarca: 'Conca de Barberà', category: 'interior', priority: 3, status: 'pending' },
  { code: '430951', name: 'Poblet (Vimbodí)', comarca: 'Conca de Barberà', category: 'interior', priority: 2, status: 'pending' },
  { code: '430969', name: 'Prades', comarca: 'Baix Camp', category: 'interior', priority: 3, status: 'pending' },
  { code: '430584', name: 'Siurana (Cornudella)', comarca: 'Priorat', category: 'interior', priority: 3, status: 'pending' },

  // ============================================
  // 🏖️ DELTA DEL EBRO
  // ============================================
  { code: '439018', name: 'Deltebre', comarca: 'Baix Ebre', category: 'costa', priority: 2, status: 'done' },
  { code: '430014', name: 'Amposta', comarca: 'Montsià', category: 'interior', priority: 2, status: 'done' },
  // Pendientes Delta
  { code: '431352', name: 'Sant Carles de la Ràpita', comarca: 'Montsià', category: 'costa', priority: 2, status: 'pending' },
  { code: '430069', name: 'Les Cases d\'Alcanar', comarca: 'Montsià', category: 'costa', priority: 3, status: 'pending' },
];

// 📊 Estadísticas de la lista
export function getPriorityStats() {
  const total = PRIORITY_MUNICIPALITIES.length;
  const done = PRIORITY_MUNICIPALITIES.filter(m => m.status === 'done').length;
  const pending = PRIORITY_MUNICIPALITIES.filter(m => m.status === 'pending').length;

  const byCategory = {
    costa: PRIORITY_MUNICIPALITIES.filter(m => m.category === 'costa').length,
    montaña: PRIORITY_MUNICIPALITIES.filter(m => m.category === 'montaña').length,
    ciudad: PRIORITY_MUNICIPALITIES.filter(m => m.category === 'ciudad').length,
    interior: PRIORITY_MUNICIPALITIES.filter(m => m.category === 'interior').length,
  };

  const byPriority = {
    1: PRIORITY_MUNICIPALITIES.filter(m => m.priority === 1).length,
    2: PRIORITY_MUNICIPALITIES.filter(m => m.priority === 2).length,
    3: PRIORITY_MUNICIPALITIES.filter(m => m.priority === 3).length,
  };

  return { total, done, pending, byCategory, byPriority };
}

// 🎯 Obtener municipios pendientes por prioridad
export function getPendingMunicipalities(maxPriority = 3) {
  return PRIORITY_MUNICIPALITIES
    .filter(m => m.status === 'pending' && m.priority <= maxPriority)
    .sort((a, b) => a.priority - b.priority);
}

// 🔍 Buscar municipio por código
export function findMunicipalityByCode(code) {
  return PRIORITY_MUNICIPALITIES.find(m => m.code === code);
}

// ✅ Marcar municipio como procesado
export function markAsDone(code) {
  const muni = PRIORITY_MUNICIPALITIES.find(m => m.code === code);
  if (muni) {
    muni.status = 'done';
    return true;
  }
  return false;
}
