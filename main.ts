import { App, Modal, Plugin, PluginSettingTab, Setting, requestUrl } from "obsidian";

// --- Settings Interface ---
interface EtymologyLookupSettings {
  lang: 'en' | 'es';
}

const DEFAULT_SETTINGS: EtymologyLookupSettings = {
  lang: 'en',
};

// --- Modal for Displaying Etymology ---
class EtymologyLookupModal extends Modal {
  data: string | undefined;
  lang: 'en' | 'es';

  constructor(app: App, data: string | undefined, lang: 'en' | 'es') {
    super(app);
    this.data = data;
    this.lang = lang;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('etymol-modal-content');
    contentEl.setText('Looking up etymology...');

    if (!this.data || this.data.trim() === '') {
      contentEl.setText('Please select a word to look up its etymology.');
      return;
    }

    try {
      const searchTerm = this.data.trim().toLowerCase();
      // Validate input: ensure it's a single word
      if (searchTerm.includes(' ')) {
        contentEl.setText('Please select a single word for etymology lookup.');
        return;
      }

      let etymology: string | null;
      if (this.lang === 'en') {
        etymology = await fetchEnglishEtymology(searchTerm);
      } else {
        etymology = await fetchSpanishEtymology(searchTerm);
      }

      if (etymology) {
        contentEl.setText(etymology);
      } else {
        contentEl.setText(`No etymology found for "${searchTerm}".`);
      }
    } catch (e) {
      contentEl.setText('Error during lookup. Are you connected to the internet?');
      console.error('Etymology lookup error:', e);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// --- Fetch Spanish Etymology from etimologias.dechile.net ---
async function fetchSpanishEtymology(word: string): Promise<string | null> {
  try {
    const url = `https://etimologias.dechile.net/?${encodeURIComponent(word)}`;
    const response = await requestUrl({ url });
    if (response.status !== 200) return null;

    const html = response.text;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const contenido = doc.querySelector('#contenido') ?? doc.querySelector('.cont');
    if (!contenido) return null;

    return contenido.textContent?.trim() ?? null;
  } catch (e) {
    console.error('Error fetching Spanish etymology:', e);
    return null;
  }
}

// --- Fetch English Etymology from Wiktionary API ---
async function fetchEnglishEtymology(word: string): Promise<string | null> {
  try {
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const response = await requestUrl({ url });
    if (response.status !== 200) return null;

    const data = response.json;
    // Wiktionary API returns definitions by language; we want English
    const englishSection = data.en;
    if (!englishSection || !Array.isArray(englishSection)) return null;

    // Extract etymology if available (Wiktionary API may include it in definitions or separate section)
    let etymology = '';
    for (const entry of englishSection) {
      if (entry.definitions) {
        const definitions = entry.definitions.map((def: any) => def.definition).filter(Boolean);
        if (definitions.length > 0) {
          etymology += definitions.join('\n');
        }
      }
    }

    // If no etymology found, try the page's HTML for the etymology section
    if (!etymology) {
      const pageUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
      const pageResponse = await requestUrl({ url: pageUrl });
      if (pageResponse.status !== 200) return null;

      const html = pageResponse.text;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const etymologySection = doc.querySelector('section[id="Etymology"], section[id^="Etymology_"]');
      if (etymologySection) {
        etymology = etymologySection.textContent?.trim() ?? '';
      }
    }

    return etymology || null;
  } catch (e) {
    console.error('Error fetching English etymology:', e);
    return null;
  }
}

// --- Settings Tab ---
class EtymologyLookupSettingsTab extends PluginSettingTab {
  plugin: EtymologyLookupPlugin;

  constructor(app: App, plugin: EtymologyLookupPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Etymology Lookup Settings' });

    new Setting(containerEl)
      .setName('Etymology Language')
      .setDesc('Select the language for etymology lookups.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('en', 'English')
          .addOption('es', 'Spanish')
          .setValue(this.plugin.settings.lang)
          .onChange(async (value: 'en' | 'es') => {
            this.plugin.settings.lang = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

// --- Main Plugin ---
export default class EtymologyLookupPlugin extends Plugin {
  settings: EtymologyLookupSettings;

  async onload() {
    await this.loadSettings();
    console.log(`Loading Etymology Lookup plugin with language: ${this.settings.lang}`);

    // Ribbon icon
    this.addRibbonIcon('sprout', 'Etymology Lookup', (event: MouseEvent) => {
      this.lookup(getCurrentSelectedText(this.app));
    });

    // Command
    this.addCommand({
      id: 'etymology-lookup',
      name: 'Look up etymology',
      callback: () => {
        this.lookup(getCurrentSelectedText(this.app));
      },
    });

    // Context menu
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu) => {
        const selection = getCurrentSelectedText(this.app);
        if (selection) {
          menu.addItem((item) => {
            item.setTitle(`Look up etymology of "${selection}"`).onClick(() => {
              this.lookup(selection);
            });
          });
        }
      })
    );

    // Settings tab
    this.addSettingTab(new EtymologyLookupSettingsTab(this.app, this));
  }

  onunload() {}

  async lookup(selection: string | undefined) {
    const modal = new EtymologyLookupModal(this.app, selection, this.settings.lang);
    modal.open();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// --- Utility to Get Selected Text ---
function getCurrentSelectedText(app: App): string {
  const editor = app.workspace.activeEditor?.editor;
  if (editor) {
    const selection = editor.getSelection();
    if (selection) return selection;
  }
  return '';
}
