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
  formatSpeed
} from '../js/speed-filter.js';

// --- Tests Task 2 : trip.js ---
import {
  haversineDistanceMeters,
  TripTracker
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
    tracker.restore({ distanceMeters: 5000, movingTimeMs: 900000 });
    tracker.reset();
    assert.strictEqual(tracker.getDistanceKm(), 0);
    assert.strictEqual(tracker.getMovingTimeSeconds(), 0);
    assert.strictEqual(tracker.getAverageSpeedKmh(), 0);
  });

  test('TripTracker sérialise et restaure l\'état', () => {
    const tracker1 = new TripTracker();
    tracker1.restore({ distanceMeters: 12450, movingTimeMs: 2500000 });
    const data = tracker1.serialize();

    const tracker2 = new TripTracker();
    tracker2.restore(data);
    assert.strictEqual(tracker2.getDistanceKm(), tracker1.getDistanceKm());
    assert.strictEqual(tracker2.getMovingTimeSeconds(), tracker1.getMovingTimeSeconds());
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

export function getSummary() {
  return { total: totalTests, passed: passedTests, failed: failedTests, results };
}

console.log(`\nTests terminés : ${passedTests}/${totalTests} réussis (${failedTests} échecs).`);
if (typeof process !== 'undefined' && process.exit && failedTests > 0) {
  process.exit(1);
}
