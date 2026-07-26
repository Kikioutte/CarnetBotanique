/* Analyse statique minimale — le projet n'avait aucun outil de lint.
   Les six fichiers de js/ sont concaténés en UN script classique au build :
   sourceType 'script', et les symboles partagés entre couches sont déclarés
   ci-dessous en globals (app.js les définit, les extensions les consomment).

   Ce que ce lint attrape : identifiants réellement inconnus (fautes de frappe,
   fonction supprimée mais encore appelée), variables et imports inutilisés,
   déclarations en double, cas de switch dupliqués.

   Ce qu'il n'attrape PAS, et qui est la faiblesse réelle de cette architecture :
   les contrats entre couches passent par `window.X`. Lire une propriété absente
   d'un objet n'est pas une erreur JavaScript, aucun linter ne peut donc voir
   qu'une couche attend quelque chose qu'aucune autre n'expose. Ce sont les
   tests bout-en-bout traversant les couches qui couvrent ce risque. */
import js from '@eslint/js';

const partagesParAppJs = [
  'plants', 'appMode', 'flashMode', 'currentFlashIndex', 'catalogLoadState', 'lenis',
  'quizOn', 'quizMode', 'quizCur', 'quizAnswered', 'quizScore', 'quizAsked', 'lastQuizId',
  'calOn', 'calMonth', 'dashOn', 'careOn', 'careState', 'careStateLoaded', 'sectionImgs',
  'esc', 'plantIsToxic', 'plantToxicity', 'renderCatalog', 'renderCare', 'renderDash',
  'renderFlashcard', 'showToast', 'saveData', 'loadData', 'setMode', 'toggleGardenStatus',
  'openDrawer', 'closeDrawer', 'openEditDrawer', 'openPlantDetail', 'openImgZoom',
  'closeImgZoom', 'toggleFlashMode', 'toggleQuizMode', 'toggleCalMode', 'toggleCareMode',
  'toggleDashMode', 'openMobileNav', 'closeMobileNav', 'buildPrint', 'gotoPlant',
  'bloomRange', 'bloomsIn', 'bloomLabel', 'selectCalMonth', 'nextFlashcard', 'prevFlashcard',
  'newQuestion', 'answerQuiz', 'quizPool', 'trapFocus', 'releaseFocusTrap', 'switchFormTab',
  'handleFormSubmit', 'carePeriod', 'careMonthName', 'parseCareMonths', 'careTasksForMonth',
  'careTaskDefsForMonth', 'careOverdueTaskDefs', 'carePlantState', 'toggleCareTask',
  'mkSubstratBar', 'mkV5Tags', 'renderSubstratRows', 'addSubstratRow', 'removeSubstratRow',
  'plantDetailURL', 'scrollToCatalog', 'resetQuizScore', 'handleSectionImgError',
  'sectionImg', 'applySectionImg', 'fetchWiki', 'initGSAPAnimations', 'showUndoToast',
];

/* Déclarées via `window.X = function X(){}` : le nom de l'expression de
   fonction n'est pas visible hors de sa propre portée, seul le global l'est. */
const globalesParAffectation = [
  'dismissDrawerDiscard', 'discardDrawerChanges', 'retryCatalogLoad', 'resetCatalogFilters',
  'formTabKeydown', 'toggleSearchPop',
];

/* Encodeur QR jamais fourni par le projet : son absence est gérée par un
   `typeof` dans drawQR(). Déclaré ici pour documenter qu'il est optionnel. */
const optionnelles = ['qrEncode'];

const fourniesParExtensions = [
  'openJournal', 'openReminders', 'openModalHTML', 'closeModal', 'sharePlant', 'printOne',
  'toggleTheme', 'cmpToggle', 'wishToggle', 'clearCompare', 'openCompare', 'waterDue',
  'checkReminders', 'journal', 'v7Export', 'v7Import', 'saveJournalMeta', 'addJournalNote',
];

export default [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', location: 'readonly', history: 'readonly',
        console: 'readonly', fetch: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', IntersectionObserver: 'readonly',
        MutationObserver: 'readonly', AbortController: 'readonly', FileReader: 'readonly',
        Image: 'readonly', Blob: 'readonly', URL: 'readonly', indexedDB: 'readonly',
        Notification: 'readonly', Event: 'readonly', prompt: 'readonly', confirm: 'readonly', alert: 'readonly', Lenis: 'readonly', gsap: 'readonly',
        ScrollTrigger: 'readonly',
        ...Object.fromEntries([...partagesParAppJs, ...fourniesParExtensions, ...globalesParAffectation].map(n => [n, 'writable'])),
        ...Object.fromEntries(optionnelles.map(n => [n, 'readonly'])),
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      // Le code utilise massivement `catch(e){}` comme repli volontaire.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-cond-assign': ['error', 'except-parens'],
      // Les symboles partagés déclarés en globals ci-dessus SONT réellement
      // définis dans js/app.js : chaque définition passerait pour un doublon.
      'no-redeclare': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      ...js.configs.recommended.rules,
      // Ces fichiers embarquent du code navigateur dans page.evaluate() :
      // ESLint ne peut pas séparer les deux portées, no-undef n'y a pas de sens.
      'no-undef': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Ces scripts détectent volontairement des emoji dans des classes de
      // caractères : la règle signale le motif recherché, pas un défaut.
      'no-misleading-character-class': 'off',
    },
  },
];
