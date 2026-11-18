// Harnais de test autonome (compatible Node.js et Navigateur)
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

export function describe(suiteName, fn) {
  console.log(`\n--- ${suiteName} ---`);
  fn();
}

export function test(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${testName}`);
    results.push({ name: testName, status: 'pass' });
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    results.push({ name: testName, status: 'fail', error: err.message });
  }
}

export const assert = {
  strictEqual(actual, expected, msg = '') {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}. ${msg}`);
    }
  },
  ok(value, msg = 'Value is not truthy') {
    if (!value) {
      throw new Error(msg);
    }
  },
  closeTo(actual, expected, delta = 0.001, msg = '') {
    if (Math.abs(actual - expected) > delta) {
      throw new Error(`Expected ${actual} to be close to ${expected} (+/- ${delta}). ${msg}`);
    }
  }
};

// --- Tests Task 1 : speed-filter.js ---
import {
  MIN_SPEED_THRESHOLD_MPS,
  toKmh,
  filterSpeed,
  formatSpeed,
  formatAverageSpeed
} from '../js/speed-filter.js';

// --- Tests Task 2 : trip.js ---
import {
  haversineDistanceMeters,
  TripTracker,
  formatDistance
} from '../js/trip.js';

// --- Tests Task 3 : geo.js ---
import {
  GPS_STATUS,
  GeoManager
} from '../js/geo.js';

// --- Tests Task 4 : wakelock.js & light.js ---
import { WakeLockManager } from '../js/wakelock.js';
import { LightManager } from '../js/light.js';

describe('Module speed-filter', () => {
  test('MIN_SPEED_THRESHOLD_MPS vaut 0.8 m/s', () => {
    assert.strictEqual(MIN_SPEED_THRESHOLD_MPS, 0.8);
  });

  test('toKmh convertit correctement les m/s en km/h', () => {
    assert.closeTo(toKmh(10), 36.0);
    assert.closeTo(toKmh(5.5555), 20.0, 0.01);
  });

  test('toKmh gère les valeurs nulles, indéfinies ou négatives', () => {
    assert.strictEqual(toKmh(null), 0);
    assert.strictEqual(toKmh(undefined), 0);
    assert.strictEqual(toKmh(-5), 0);
  });

  test('filterSpeed force à 0 si vitesse brute < seuil (0.8 m/s)', () => {
    assert.strictEqual(filterSpeed(0.5, 0), 0);
    assert.strictEqual(filterSpeed(0.79, 15), 0); // descente immédiate sous le seuil
    assert.strictEqual(filterSpeed(0, 20), 0);
  });

  test('filterSpeed applique le lissage exponentiel (EMA alpha=0.4)', () => {
    // 10 m/s = 36 km/h. Avec prev = 0 : 0.4 * 36 + 0.6 * 0 = 14.4 km/h
    const res1 = filterSpeed(10, 0, 0.4);
    assert.closeTo(res1, 14.4);

    // Suivant avec brute = 10 m/s (36 km/h) et prev = 14.4 : 0.4 * 36 + 0.6 * 14.4 = 14.4 + 8.64 = 23.04
    const res2 = filterSpeed(10, 14.4, 0.4);
    assert.closeTo(res2, 23.04);
  });

  test('formatSpeed formate les valeurs numériques et gère null/NaN', () => {
    assert.strictEqual(formatSpeed(null), '--');
    assert.strictEqual(formatSpeed(NaN), '--');
    assert.strictEqual(formatSpeed(0), '0');
    assert.strictEqual(formatSpeed(24.2), '24');
    assert.strictEqual(formatSpeed(24.8), '25');
  });

  test('formatAverageSpeed renvoie "--" si la moyenne est null ou indisponible, et "0.0" pour 0', () => {
    assert.strictEqual(formatAverageSpeed(null), '--');
    assert.strictEqual(formatAverageSpeed(undefined), '--');
    assert.strictEqual(formatAverageSpeed(NaN), '--');
    assert.strictEqual(formatAverageSpeed(-1), '--');
    assert.strictEqual(formatAverageSpeed(0), '0.0');
    assert.strictEqual(formatAverageSpeed(21.42), '21.4');
    assert.strictEqual(formatAverageSpeed(4.0), '4.0');
  });
});

describe('Module trip - Calculateur de Trajet', () => {
  test('haversineDistanceMeters calcule la distance entre Tour Eiffel et Notre-Dame', () => {
    // Tour Eiffel: 48.8584, 2.2945 | Notre-Dame: 48.8530, 2.3499
    const d = haversineDistanceMeters(48.8584, 2.2945, 48.8530, 2.3499);
    // Distance réelle vol d'oiseau : ~4100 mètres (+/- 50m)
    assert.ok(d > 4050 && d < 4150, `Distance calculée: ${d}`);
  });

  test('TripTracker n\'accumule ni distance ni temps quand la vitesse est nulle', () => {
    const tracker = new TripTracker();
    tracker.update(48.8584, 2.2945, 0, 1000);
    tracker.update(48.8585, 2.2946, 0, 2000); // jitter GPS stationnaire
    assert.strictEqual(tracker.getDistanceKm(), 0);
    assert.strictEqual(tracker.getMovingTimeSeconds(), 0);
    assert.strictEqual(tracker.getAverageSpeedKmh(), 0);
  });

  test('TripTracker accumule distance et temps en mouvement quand la vitesse est active', () => {
    const tracker = new TripTracker();
    // Point 1 à t=1000
    tracker.update(48.8584, 2.2945, 20, 1000);
    // Point 2 à t=11000 (10s plus tard), environ 55m plus loin
    tracker.update(48.8589, 2.2945, 20, 11000);

    assert.strictEqual(tracker.getMovingTimeSeconds(), 10);
    assert.ok(tracker.getDistanceKm() > 0.05 && tracker.getDistanceKm() < 0.06);
  });

  test('TripTracker calcule la vitesse moyenne exacte', () => {
    const tracker = new TripTracker();
    // Simuler directement un trajet de 10 km en 1800 secondes (0.5 h) -> 20 km/h
    tracker.restore({ distanceMeters: 10000, movingTimeMs: 1800000 });
    assert.closeTo(tracker.getAverageSpeedKmh(), 20.0, 0.01);
  });

  test('TripTracker formate la durée en MM:SS et HH:MM:SS', () => {
    const tracker = new TripTracker();
    assert.strictEqual(tracker.formatDuration(65), '01:05');
    assert.strictEqual(tracker.formatDuration(3665), '01:01:05');
  });

  test('TripTracker réinitialise les compteurs', () => {
    const tracker = new TripTracker();
    tracker.restore({ distanceMeters: 5000, movingTimeMs: 900000, totalTimeMs: 1200000, isPaused: true });
    tracker.reset();
    assert.strictEqual(tracker.getDistanceKm(), 0);
    assert.strictEqual(tracker.getMovingTimeSeconds(), 0);
    assert.strictEqual(tracker.getTotalTimeSeconds(), 0);
    assert.strictEqual(tracker.isPaused(), false);
    assert.strictEqual(tracker.getAverageSpeedKmh(), 0);
  });

  test('TripTracker garantit la cohérence des données au démarrage (temps nul = distance nulle)', () => {
    const tracker = new TripTracker();
    tracker.reset();
    assert.strictEqual(tracker.getDistanceKm(), 0, 'La distance au démarrage doit être nulle');
    assert.strictEqual(tracker.getMovingTimeSeconds(), 0, 'Le temps en mouvement au démarrage doit être nul');
    assert.strictEqual(tracker.getTotalTimeSeconds(), 0, 'Le temps total au démarrage doit être nul');
    assert.strictEqual(tracker.getFormattedDistance(), '0.00');
    assert.strictEqual(tracker.formatDuration(0), '00:00');
    assert.strictEqual(tracker.getMovingAverageSpeedKmh(), null, 'Moyenne non établie au démarrage');
    assert.strictEqual(tracker.getTotalAverageSpeedKmh(), null, 'Moyenne totale non établie au démarrage');
  });

  test('TripTracker.restore garantit la cohérence physique entre totalTimeMs et movingTimeMs', () => {
    const tracker = new TripTracker();
    // Cas où totalTimeMs est omis dans les données sérialisées
    tracker.restore({ distanceMeters: 1420, movingTimeMs: 215000 });
    assert.strictEqual(tracker.getDistanceKm(), 1.42);
    assert.strictEqual(tracker.getMovingTimeSeconds(), 215);
    // Le temps total doit être au moins égal au temps de roulage (jamais 0 alors que movingTimeMs > 0)
    assert.ok(tracker.getTotalTimeSeconds() >= 215, 'totalTimeSeconds doit valoir au moins 215s');
    assert.strictEqual(tracker.getTotalTimeSeconds(), 215);
    assert.ok(tracker.getTotalAverageSpeedKmh() !== null);
    assert.closeTo(tracker.getTotalAverageSpeedKmh(), 23.776, 0.01);
  });

  test('TripTracker démarre par défaut avec isPaused = false et totalTimeMs = 0', () => {
    const tracker = new TripTracker();
    assert.strictEqual(tracker.isPaused(), false);
    assert.strictEqual(tracker.getTotalTimeSeconds(), 0);
  });

  test('TripTracker cumule le temps total lors des arrêts sans incrémenter le temps de roulage', () => {
    const tracker = new TripTracker();
    // Départ t=1000 en mouvement (20 km/h)
    tracker.update(48.8584, 2.2945, 20, 1000);
    // t=6000 (5s de roulage)
    tracker.update(48.8589, 2.2945, 20, 6000);
    // Arrêt au feu rouge : t=11000 (vitesse 0 km/h pendant 5s)
    tracker.update(48.8589, 2.2945, 0, 11000);
    // Toujours au feu : t=16000 (encore 5s à 0 km/h)
    tracker.update(48.8589, 2.2945, 0, 16000);

    assert.strictEqual(tracker.getMovingTimeSeconds(), 5);
    assert.strictEqual(tracker.getTotalTimeSeconds(), 15);
  });

  test('TripTracker en pause fige la distance, le temps de roulage et le temps total', () => {
    const tracker = new TripTracker();
    tracker.update(48.8584, 2.2945, 20, 1000);
    tracker.update(48.8589, 2.2945, 20, 6000); // 5s de roulage
    const distBefore = tracker.getDistanceKm();

    // Mise en pause (ex: déjeuner)
    tracker.setPaused(true);
    assert.strictEqual(tracker.isPaused(), true);

    // Activité pendant la pause (t=120000, 2 min plus tard)
    tracker.update(48.8600, 2.2950, 15, 120000);
    tracker.update(48.8610, 2.2960, 0, 130000);

    assert.strictEqual(tracker.getDistanceKm(), distBefore);
    assert.strictEqual(tracker.getMovingTimeSeconds(), 5);
    assert.strictEqual(tracker.getTotalTimeSeconds(), 5);
  });

  test('TripTracker calcule distinctement la vitesse moyenne de roulage et la moyenne totale', () => {
    const tracker = new TripTracker();
    tracker.restore({
      distanceMeters: 10000,
      movingTimeMs: 1800000, // 0.5 h -> 20 km/h
      totalTimeMs: 3600000   // 1.0 h -> 10 km/h
    });

    assert.closeTo(tracker.getMovingAverageSpeedKmh(), 20.0, 0.01);
    assert.closeTo(tracker.getTotalAverageSpeedKmh(), 10.0, 0.01);
    assert.closeTo(tracker.getAverageSpeedKmh(), 20.0, 0.01);
  });

  test('La vitesse moyenne reste null tant que le temps de déplacement est inférieur à 5 secondes (anti-pic initial)', () => {
    const tracker = new TripTracker();
    // Simuler un premier saut GPS de 3.5m en 1 seconde à la marche (4 km/h)
    tracker.update(48.85840, 2.29450, 4, 1000);
    tracker.update(48.85843, 2.29452, 4, 2000); // 1s de mouvement, ~3.5m

    assert.strictEqual(tracker.getMovingTimeSeconds(), 1);
    // Avant le seuil de 5s, pour éviter le pic dû au jitter GPS divisé par 1s, la moyenne vaut null
    assert.strictEqual(tracker.getMovingAverageSpeedKmh(), null);
    assert.strictEqual(tracker.getTotalAverageSpeedKmh(), null);

    // Après 6 secondes de mouvement (au-delà du seuil de 5s)
    tracker.update(48.85845, 2.29454, 4, 7000);
    assert.ok(tracker.getMovingTimeSeconds() >= 5);
    // La moyenne doit maintenant être calculée et cohérente (autour de 4 km/h, pas 12 km/h)
    const avg = tracker.getMovingAverageSpeedKmh();
    assert.ok(avg !== null && avg > 0 && avg < 8, `Vitesse moyenne attendue réaliste (<8 km/h), obtenue: ${avg}`);
  });

  test('La moyenne totale commence à être affichée dès 5 secondes de temps total même sans mouvement', () => {
    const tracker = new TripTracker();
    // Départ t=1000 à l'arrêt au feu rouge (vitesse 0 km/h)
    tracker.update(48.8584, 2.2945, 0, 1000);
    // t=4000 (3s écoulées à l'arrêt) : totalTimeMs = 3000 < 5000
    tracker.update(48.8584, 2.2945, 0, 4000);
    assert.strictEqual(tracker.getTotalAverageSpeedKmh(), null);
    assert.strictEqual(tracker.getMovingAverageSpeedKmh(), null);

    // t=7000 (6s écoulées au total à l'arrêt) : totalTimeMs = 6000 >= 5000
    tracker.update(48.8584, 2.2945, 0, 7000);
    assert.strictEqual(tracker.getMovingTimeSeconds(), 0);
    assert.strictEqual(tracker.getTotalTimeSeconds(), 6);

    // La moyenne en mouvement reste null (pas encore 5s de roulage)
    assert.strictEqual(tracker.getMovingAverageSpeedKmh(), null);
    // Mais la moyenne totale est désormais disponible et vaut 0.0 km/h !
    assert.strictEqual(tracker.getTotalAverageSpeedKmh(), 0);
    assert.strictEqual(formatAverageSpeed(tracker.getTotalAverageSpeedKmh()), '0.0');
    assert.strictEqual(formatAverageSpeed(tracker.getMovingAverageSpeedKmh()), '--');
  });

  test('checkAutoResume réactive le trajet après 3 secondes au-dessus de 12 km/h', () => {
    const tracker = new TripTracker();
    tracker.setPaused(true);

    // t=1000 : 5 km/h (marche) -> pas de reprise
    assert.strictEqual(tracker.checkAutoResume(5, 1000), false);
    assert.strictEqual(tracker.isPaused(), true);

    // t=2000 : 15 km/h (> 12 km/h) -> début du chronomètre de reprise
    assert.strictEqual(tracker.checkAutoResume(15, 2000), false);
    assert.strictEqual(tracker.isPaused(), true);

    // t=4000 : 2s écoulées à 16 km/h -> pas encore 3s
    assert.strictEqual(tracker.checkAutoResume(16, 4000), false);
    assert.strictEqual(tracker.isPaused(), true);

    // t=5100 : 3.1s écoulées à 18 km/h -> auto-reprise déclenchée
    assert.strictEqual(tracker.checkAutoResume(18, 5100), true);
    assert.strictEqual(tracker.isPaused(), false);
  });

  test('TripTracker sérialise et restaure totalTimeMs et isPaused', () => {
    const tracker1 = new TripTracker();
    tracker1.restore({
      distanceMeters: 12450,
      movingTimeMs: 2500000,
      totalTimeMs: 3800000,
      isPaused: true,
      lastSavedTimestamp: 123456789
    });
    const data = tracker1.serialize();

    const tracker2 = new TripTracker();
    tracker2.restore(data);
    assert.strictEqual(tracker2.getDistanceKm(), tracker1.getDistanceKm());
    assert.strictEqual(tracker2.getMovingTimeSeconds(), tracker1.getMovingTimeSeconds());
    assert.strictEqual(tracker2.getTotalTimeSeconds(), 3800);
    assert.strictEqual(tracker2.isPaused(), true);
    assert.strictEqual(tracker2.lastSavedTimestamp, tracker1.lastSavedTimestamp);
    assert.ok(tracker2.lastSavedTimestamp > 0);
  });

  test('TripTracker.determineStartupAction gère l\'absence de trajet précédent', () => {
    assert.strictEqual(TripTracker.determineStartupAction(null).action, 'none');
    assert.strictEqual(TripTracker.determineStartupAction({ distanceMeters: 0 }).action, 'none');
  });

  test('TripTracker.determineStartupAction propose la reprise par défaut si moins de 2h se sont écoulées', () => {
    const saved = {
      distanceMeters: 14200,
      movingTimeMs: 2400000,
      totalTimeMs: 2700000,
      lastSavedTimestamp: 10000000
    };
    // 45 minutes plus tard (< 2h)
    const now = 10000000 + 45 * 60 * 1000;
    const decision = TripTracker.determineStartupAction(saved, now);

    assert.strictEqual(decision.action, 'prompt');
    assert.strictEqual(decision.defaultChoice, 'resume');
    assert.strictEqual(decision.buttonLabel, 'Nouveau trajet');
    assert.strictEqual(decision.alternativeChoice, 'new');
    assert.closeTo(decision.distanceKm, 14.2, 0.01);
  });

  test('TripTracker.determineStartupAction propose un nouveau trajet par défaut si plus de 2h se sont écoulées', () => {
    const saved = {
      distanceMeters: 24500,
      movingTimeMs: 4000000,
      totalTimeMs: 4500000,
      lastSavedTimestamp: 10000000
    };
    // 3 heures plus tard (>= 2h)
    const now = 10000000 + 3 * 3600 * 1000;
    const decision = TripTracker.determineStartupAction(saved, now);

    assert.strictEqual(decision.action, 'prompt');
    assert.strictEqual(decision.defaultChoice, 'new');
    assert.strictEqual(decision.buttonLabel, 'Reprendre (24.5 km)');
    assert.strictEqual(decision.alternativeChoice, 'resume');
    assert.closeTo(decision.distanceKm, 24.5, 0.01);
  });

  test('formatDistance applique les paliers adaptatifs (<10km: 2 déc, <100km: 1 déc, >=100km: 0 déc)', () => {
    // En dessous de 10 km : 2 décimales
    assert.strictEqual(formatDistance(0), '0.00');
    assert.strictEqual(formatDistance(0.05), '0.05');
    assert.strictEqual(formatDistance(1.423), '1.42');
    assert.strictEqual(formatDistance(9.994), '9.99');

    // Entre 10 km et 100 km : 1 décimale
    assert.strictEqual(formatDistance(10.0), '10.0');
    assert.strictEqual(formatDistance(24.54), '24.5');
    assert.strictEqual(formatDistance(99.88), '99.9');

    // À partir de 100 km : 0 décimale
    assert.strictEqual(formatDistance(100.0), '100');
    assert.strictEqual(formatDistance(142.3), '142');
    assert.strictEqual(formatDistance(250.8), '251');
  });
});

describe('Module geo - Gestionnaire GPS & Watchdog', () => {
  test('GPS_STATUS expose les états attendus', () => {
    assert.strictEqual(GPS_STATUS.SEARCHING, 'SEARCHING');
    assert.strictEqual(GPS_STATUS.ACTIVE, 'ACTIVE');
    assert.strictEqual(GPS_STATUS.LOST, 'LOST');
    assert.strictEqual(GPS_STATUS.ERROR, 'ERROR');
  });

  test('GeoManager démarre à l\'état SEARCHING', () => {
    const geo = new GeoManager();
    assert.strictEqual(geo.getStatus(), GPS_STATUS.SEARCHING);
  });

  test('handlePosition valide passe le statut à ACTIVE et émet la vitesse', () => {
    let emittedSpeed = null;
    let emittedStatus = null;

    const geo = new GeoManager({
      onSpeed: (s) => { emittedSpeed = s; },
      onStatus: (st) => { emittedStatus = st; }
    });

    const mockPos = {
      coords: {
        latitude: 48.8584,
        longitude: 2.2945,
        speed: 5.0, // 5 m/s = 18 km/h
        accuracy: 10
      },
      timestamp: 1000
    };

    geo.handlePosition(mockPos);
    assert.strictEqual(geo.getStatus(), GPS_STATUS.ACTIVE);
    assert.strictEqual(emittedStatus, GPS_STATUS.ACTIVE);
    // Vitesse filtrée (avec alpha = 0.4, prev = 0 : 0.4 * 18 = 7.2)
    assert.closeTo(emittedSpeed, 7.2);
  });

  test('handlePosition ignore les positions avec accuracy > 35m', () => {
    let speedUpdateCount = 0;
    const geo = new GeoManager({
      onSpeed: () => { speedUpdateCount++; }
    });

    const inaccuratePos = {
      coords: {
        latitude: 48.8584,
        longitude: 2.2945,
        speed: 5.0,
        accuracy: 45 // Trop imprécis
      },
      timestamp: 1000
    };

    geo.handlePosition(inaccuratePos);
    assert.strictEqual(geo.getStatus(), GPS_STATUS.SEARCHING);
    assert.strictEqual(speedUpdateCount, 0);
  });

  test('La simulation d\'itinéraire génère un déplacement métrique exactement égal à speedMps', () => {
    // Calcul pour speedMps = 8.3 m/s (~30 km/h)
    const speedMps = 8.3;
    const curLat = 48.8584;
    const curLon = 2.2945;
    const distMps = speedMps / Math.SQRT2;
    const deltaLat = distMps / 111139;
    const deltaLon = distMps / (111139 * Math.cos((curLat * Math.PI) / 180));

    const measuredDist = haversineDistanceMeters(
      curLat,
      curLon,
      curLat + deltaLat,
      curLon + deltaLon
    );

    assert.closeTo(measuredDist, speedMps, 0.05, 'Le déplacement doit correspondre exactement à la vitesse (8.3m)');
  });

  test('triggerWatchdogTimeout passe le statut à LOST et émet vitesse null', () => {
    let emittedSpeed = 99;
    let emittedStatus = null;

    const geo = new GeoManager({
      onSpeed: (s) => { emittedSpeed = s; },
      onStatus: (st) => { emittedStatus = st; }
    });

    // Émettre une position active d'abord
    geo.handlePosition({
      coords: { latitude: 48.8584, longitude: 2.2945, speed: 5.0, accuracy: 10 },
      timestamp: 1000
    });
    assert.strictEqual(geo.getStatus(), GPS_STATUS.ACTIVE);

    // Déclencher le watchdog (tunnel ou perte signal)
    geo.triggerWatchdogTimeout();
    assert.strictEqual(geo.getStatus(), GPS_STATUS.LOST);
    assert.strictEqual(emittedStatus, GPS_STATUS.LOST);
    assert.strictEqual(emittedSpeed, null);
  });

  test('Reprise du signal après perte repasse immédiatement en ACTIVE', () => {
    let emittedStatus = null;
    const geo = new GeoManager({
      onStatus: (st) => { emittedStatus = st; }
    });

    geo.triggerWatchdogTimeout();
    assert.strictEqual(geo.getStatus(), GPS_STATUS.LOST);

    geo.handlePosition({
      coords: { latitude: 48.8584, longitude: 2.2945, speed: 6.0, accuracy: 12 },
      timestamp: 2000
    });
    assert.strictEqual(geo.getStatus(), GPS_STATUS.ACTIVE);
    assert.strictEqual(emittedStatus, GPS_STATUS.ACTIVE);
  });
});

describe('Module wakelock & light - Verrou d\'écran et Capteur de luminosité', () => {
  test('WakeLockManager gère l\'absence de support sans planter', async () => {
    // Dans un environnement sans navigator.wakeLock
    const manager = new WakeLockManager({ navigatorObj: {} });
    assert.strictEqual(manager.isActive(), false);
    const success = await manager.requestLock();
    assert.strictEqual(success, false);
    assert.strictEqual(manager.isActive(), false);
  });

  test('WakeLockManager acquiert et libère le verrou avec un mock', async () => {
    let released = false;
    const mockSentinel = {
      release: async () => { released = true; },
      addEventListener: () => {}
    };

    const mockNavigator = {
      wakeLock: {
        request: async (type) => {
          assert.strictEqual(type, 'screen');
          return mockSentinel;
        }
      }
    };

    const manager = new WakeLockManager({ navigatorObj: mockNavigator });
    const success = await manager.requestLock();
    assert.strictEqual(success, true);
    assert.strictEqual(manager.isActive(), true);

    await manager.releaseLock();
    assert.strictEqual(released, true);
    assert.strictEqual(manager.isActive(), false);
  });

  test('LightManager démarre en mode eco par défaut', () => {
    const light = new LightManager();
    assert.strictEqual(light.getTheme(), 'eco');
    assert.strictEqual(light.isManual(), false);
  });

  test('LightManager toggleManualMode bascule entre sun et eco', () => {
    let currentTheme = null;
    const light = new LightManager({
      onThemeChange: (th) => { currentTheme = th; }
    });

    const next1 = light.toggleManualMode();
    assert.strictEqual(next1, 'sun');
    assert.strictEqual(currentTheme, 'sun');
    assert.strictEqual(light.isManual(), true);

    const next2 = light.toggleManualMode();
    assert.strictEqual(next2, 'eco');
    assert.strictEqual(currentTheme, 'eco');
  });

  test('LightManager traite les seuils lux en mode automatique', () => {
    let theme = 'eco';
    const light = new LightManager({
      onThemeChange: (th) => { theme = th; }
    });

    // Seuil plein soleil : > 10000 lux
    light.handleIlluminance(15000);
    assert.strictEqual(theme, 'sun');
    assert.strictEqual(light.getTheme(), 'sun');

    // Seuil retour éco : < 2000 lux
    light.handleIlluminance(800);
    assert.strictEqual(theme, 'eco');
    assert.strictEqual(light.getTheme(), 'eco');
  });
});

let cssContent = '';
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  cssContent = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf-8');
} else if (typeof window !== 'undefined' && window.fetch) {
  try {
    const res = await fetch('../css/style.css');
    cssContent = await res.text();
  } catch (e) {}
}

describe('Feuille de styles (CSS) - Estompement adouci et alerte GPS perdu à 100%', () => {
  test('Le conteneur global .hud-header.dimmed n\'écrase plus l\'opacité de ses enfants à 0.15', () => {
    assert.ok(cssContent.length > 0, 'Le fichier css/style.css doit être accessible');
    assert.ok(
      !/\.hud-header\.dimmed\s*\{\s*opacity:\s*0\.15/i.test(cssContent),
      'L\'opacité de 0.15 sur .hud-header.dimmed doit être supprimée pour ne pas écraser les enfants'
    );
  });

  test('--header-dim-opacity est défini avec une opacité adoucie (>= 0.40)', () => {
    assert.ok(
      /--header-dim-opacity:\s*0\.[4-9]/i.test(cssContent),
      'La variable --header-dim-opacity doit être définie avec une valeur adoucie >= 0.40'
    );
  });

  test('L\'estompement cible les contrôles de droite et le badge GPS avec la variable adoucie', () => {
    assert.ok(
      /\.hud-header\.dimmed\s+.*\.header-right/i.test(cssContent) && /\.hud-header\.dimmed\s+.*\.gps-badge/i.test(cssContent),
      'L\'estompement doit cibler séparément .header-right et .gps-badge'
    );
  });

  test('L\'indicateur GPS en statut LOST revient à 100% d\'opacité quand l\'en-tête est dimmed', () => {
    assert.ok(
      /\.hud-header\.dimmed\s+\.gps-badge\.status-lost[^{]*\{[^}]*opacity:\s*1/i.test(cssContent),
      'Le badge GPS en statut LOST (.status-lost) doit repasser à opacity: 1 même avec .hud-header.dimmed'
    );
  });

  test('L\'indicateur GPS en statut ERROR revient à 100% d\'opacité quand l\'en-tête est dimmed', () => {
    assert.ok(
      /\.hud-header\.dimmed\s+\.gps-badge\.status-error[^{]*\{[^}]*opacity:\s*1/i.test(cssContent),
      'Le badge GPS en statut ERROR (.status-error) doit repasser à opacity: 1 même avec .hud-header.dimmed'
    );
  });

  test('L\'état en pause du bandeau n\'a pas de pourtour/outline orange', () => {
    assert.ok(
      !/\.hud-metrics\.is-paused[^{]*\{[^}]*outline:/i.test(cssContent),
      'Le bandeau en pause ne doit plus avoir de bordure/outline orange'
    );
  });

  test('Le toast de notification s\'affiche au-dessus des métriques avec un style épuré assorti au thème', () => {
    assert.ok(
      !/\.toast\s*\{[^}]*top:\s*50%/i.test(cssContent),
      'Le toast ne doit plus être centré à top: 50% sur la vitesse géante'
    );
    assert.ok(
      /\.toast\s*\{[^}]*bottom:\s*calc\(/i.test(cssContent),
      'Le toast doit être positionné au-dessus des métriques via bottom'
    );
    assert.ok(
      /\.toast\s*\{[^}]*background:\s*#000000/i.test(cssContent),
      'Le toast doit avoir un fond noir pur #000000'
    );
  });

  test('.metrics-hidden neutralise toute animation pour garantir un masquage complet', () => {
    assert.ok(
      /\.hud-metrics\.metrics-hidden[^{]*\{[^}]*animation:\s*none\s*!important/i.test(cssContent),
      '.hud-metrics.metrics-hidden doit couper les animations avec !important'
    );
  });

  test('.showing-startup-prompt masque les cartes et les points de pagination avec un bouton dimensionné', () => {
    assert.ok(
      /\.hud-metrics\.showing-startup-prompt\s+\.carousel-dots[^{]*\{[^}]*display:\s*none\s*!important/i.test(cssContent),
      'Les points de pagination doivent être masqués avec !important'
    );
    assert.ok(
      /\.startup-btn\s*\{[^}]*height:\s*(?:100%|5[0-9]px|6[0-9]px)/i.test(cssContent),
      'Le bouton de démarrage doit avoir une hauteur adaptée'
    );
    assert.ok(
      /\.hud-metrics\s*\{[^}]*height:\s*80px/i.test(cssContent),
      '.hud-metrics doit avoir une hauteur fixe de 80px pour stabiliser verticalement la vitesse centrale'
    );
  });

  test('.speed-value et .hud-main verrouillent la boîte de vitesse à height: 1em et min-height: 0', () => {
    assert.ok(
      /\.speed-value\s*\{[^}]*height:\s*1em/i.test(cssContent),
      '.speed-value doit avoir height: 1em pour ne pas varier entre "--" et un nombre'
    );
    assert.ok(
      /\.speed-value\s*\{[^}]*line-height:\s*1/i.test(cssContent),
      '.speed-value doit avoir line-height: 1'
    );
    assert.ok(
      /\.hud-main\s*\{[^}]*min-height:\s*0/i.test(cssContent),
      '.hud-main doit avoir min-height: 0 pour ne jamais repousser le bandeau inférieur'
    );
    assert.ok(
      /\.hud-metrics\s*\{[^}]*flex-shrink:\s*0/i.test(cssContent),
      '.hud-metrics doit avoir flex-shrink: 0 pour rester parfaitement figé'
    );
  });
});

export function getSummary() {
  return { total: totalTests, passed: passedTests, failed: failedTests, results };
}

console.log(`\nTests terminés : ${passedTests}/${totalTests} réussis (${failedTests} échecs).`);
if (typeof process !== 'undefined' && process.exit && failedTests > 0) {
  process.exit(1);
}
