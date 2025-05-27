import { App, Modal, Plugin, requestUrl } from "obsidian";
import { Etymo } from "./lib/etymo-js";
import { displayEntries } from "./util/displayEntries";
import { ellipsis } from "./util/ellipsis";

const etymo = new Etymo();

class LanguagePromptModal extends Modal {
  selection: string | undefined;
  onSubmit: (lang: 'en' | 'es') => void;

  constructor(app: App, selection: string | undefined, onSubmit: (lang: 'en' | 'es') => void) {
    super(app);
    this.selection = selection;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('etymol-language-prompt');
    contentEl.createEl('h2', { text: 'Select Language' });
    contentEl.createEl('p', { text: 'Buscar etimología / Search etymology' });

    const buttonContainer = contentEl.createDiv({ cls: 'etymol-button-container' });

    const englishButton = buttonContainer.createEl('button', { text: 'English' });
    englishButton.style.marginRight = '12px';
    englishButton.addEventListener('click', () => {
      this.onSubmit('en');
      this.close();
    });

    const spanishButton = buttonContainer.createEl('button', { text: 'Español' });
    spanishButton.addEventListener('click', () => {
      this.onSubmit('es');
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

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
    contentEl.setText("Searching...");
    contentEl.className = "etymol-modal-content";

    if (this.data) {
      try {
        const searchTerm = this.data.trim().toLowerCase();
        if (this.lang === 'en') {
          const entries = await etymo.search(searchTerm);
          displayEntries(entries, contentEl, searchTerm);
        } else {
          const [etymDPD, etymDLE] = await Promise.all([
            fetchSpanishEtymologyDPD(searchTerm),
            fetchSpanishEtymologyDLE(searchTerm)
          ]);

          contentEl.empty();
          const wordEl = contentEl.createEl('h2', { text: searchTerm });
          wordEl.style.marginBottom = '1em';

          const dpdHeader = contentEl.createEl('h3', { text: 'Fuente: DPD (RAE)' });
          const dpdText = contentEl.createEl('div');
          dpdText.style.whiteSpace = 'pre-wrap';
          dpdText.setText(etymDPD ?? 'No se ha encontrado la etimología.');

          const dleHeader = contentEl.createEl('h3', { text: 'Fuente: DLE (RAE)' });
          const dleText = contentEl.createEl('div');
          dleText.style.whiteSpace = 'pre-wrap';
          dleText.setText(etymDLE ?? 'No se ha encontrado la etimología.');
        }
      } catch (error) {
        contentEl.setText("Search failed. Are you connected to the internet?");
        console.error('Etymology lookup error:', error);
      }
    } else {
      contentEl.setText("");
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

async function fetchSpanishEtymologyDPD(word: string): Promise<string | null> {
  try {
    const url = `https://www.rae.es/dpd/${encodeURIComponent(word)}`;
    const response = await requestUrl({ url });
    if (response.status !== 200) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(response.text, 'text/html');

    const sections = Array.from(doc.querySelectorAll('section'));
    for (const section of sections) {
      const header = section.querySelector('h2');
      if (header && header.textContent?.trim().toLowerCase() === 'etimología') {
        const etimologyText = section.textContent?.replace(/^etimología\s*/i, '').trim();
        if (etimologyText) return etimologyText;
      }
    }

    const firstSenseP = doc.querySelector('p[data-heading="sense"]');
    if (firstSenseP) {
      const text = firstSenseP.textContent?.trim();
      if (text) return text;
    }

    return null;
  } catch (error) {
    console.error('Error fetching Spanish etymology from DPD:', error);
    return null;
  }
}

async function fetchSpanishEtymologyDLE(word: string): Promise<string | null> {
  try {
    const url = `https://dle.rae.es/${encodeURIComponent(word)}`;
    const response = await requestUrl({ url });
    if (response.status !== 200) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(response.text, 'text/html');

    // Buscar el span.etimologia dentro de div.etim
    const etymSpan = doc.querySelector('div.etim span.etimologia');
    if (etymSpan) {
      return etymSpan.textContent?.trim() || null;
    }

    return null;
  } catch (error) {
    console.error('Error fetching Spanish etymology from DLE:', error);
    return null;
  }
}

export default class EtymologyLookupPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon("sprout", "Etymology Lookup", () => {
      const selection = getCurrentSelectedText(this.app);
      this.promptAndLookup(selection);
    });

    this.addCommand({
      id: "search",
      name: "Search Etymology",
      callback: () => {
        const selection = getCurrentSelectedText(this.app);
        this.promptAndLookup(selection);
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection();
        if (selection) {
          menu.addItem((item) => {
            item.setTitle(`Get etymology of \"${ellipsis(selection, 18)}\"`).onClick(() => {
              this.promptAndLookup(selection);
            });
          });
        }
      })
    );
  }

  onunload() {}

  async promptAndLookup(selection: string | undefined) {
    if (!selection) return;
    new LanguagePromptModal(this.app, selection, (lang: 'en' | 'es') => {
      const modal = new EtymologyLookupModal(this.app, selection, lang);
      modal.open();
    }).open();
  }
}

function getCurrentSelectedText(app: App): string {
  const editor = app.workspace.activeEditor?.editor;
  if (editor) {
    const selection = editor.getSelection();
    if (typeof selection === 'string' && selection.trim()) {
      return selection.trim();
    }
  }
  const selection = document.getSelection()?.toString();
  return (selection && selection.trim()) || '';
}
