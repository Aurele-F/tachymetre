/**
 * Module de maintien de l'écran allumé (Screen Wake Lock API) pour Tachymètre Vélo PWA.
 * Demande de verrou, gestion gracieuse des erreurs et ré-acquisition sur 'visibilitychange'.
 */

export class WakeLockManager {
  /**
   * @param {object} [options]
   * @param {Navigator} [options.navigatorObj]
   * @param {Document} [options.documentObj]
   * @param {(active: boolean) => void} [options.onLockChange]
   */
  constructor(options = {}) {
    this.nav = options.navigatorObj !== undefined
      ? options.navigatorObj
      : (typeof navigator !== 'undefined' ? navigator : null);

    this.doc = options.documentObj !== undefined
      ? options.documentObj
      : (typeof document !== 'undefined' ? document : null);

    this.onLockChange = options.onLockChange || (() => {});
    this.sentinel = null;
    this.boundVisibilityHandler = this.handleVisibilityChange.bind(this);

    if (this.doc && this.doc.addEventListener) {
      this.doc.addEventListener('visibilitychange', this.boundVisibilityHandler);
    }
  }

  /**
   * Indique si le verrouillage d'écran est actif.
   * @returns {boolean}
   */
  isActive() {
    return this.sentinel !== null;
  }

  /**
   * Tente d'acquérir le verrou d'écran.
   * @returns {Promise<boolean>}
   */
  async requestLock() {
    if (!this.nav || !this.nav.wakeLock || typeof this.nav.wakeLock.request !== 'function') {
      return false;
    }

    try {
      this.sentinel = await this.nav.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
        this.onLockChange(false);
      });
      this.onLockChange(true);
      return true;
    } catch (err) {
      this.sentinel = null;
      this.onLockChange(false);
      return false;
    }
  }

  /**
   * Libère le verrou d'écran.
   * @returns {Promise<void>}
   */
  async releaseLock() {
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch (err) {
        // Ignorer l'erreur lors de la libération
      }
      this.sentinel = null;
      this.onLockChange(false);
    }
  }

  /**
   * Gestionnaire de ré-acquisition automatique lorsque l'onglet redevient visible.
   */
  async handleVisibilityChange() {
    if (this.doc && this.doc.visibilityState === 'visible' && !this.isActive()) {
      await this.requestLock();
    }
  }

  /**
   * Nettoie les écouteurs d'événements.
   */
  destroy() {
    if (this.doc && this.doc.removeEventListener) {
      this.doc.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    }
    this.releaseLock();
  }
}
