import { App, Modal, Plugin, Notice, requestUrl } from "obsidian";
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
    contentEl.createEl('p', { text: `Look up etymology for "${this.selection || 'unknown'}" in:` });

    const buttonContainer = contentEl.createDiv({ cls: 'etymol-button-container' });
    buttonContainer.createEl('button', { text: 'English' }).addEventListener('click', () => {
      this.onSubmit('en');
      this.close();
    });
    buttonContainer.createEl('button', { text: 'Spanish' }).addEventListener('click', () => {
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
          const etymology = await fetchSpanishEtymology(searchTerm);
          if (etymology) {
            contentEl.setText(etymology);
          } else {
            contentEl.setText(`No etymology found for "${searchTerm}".`);
          }
        }
      } catch (e) {
        contentEl.setText("Search failed. Are you connected to the internet?");
        console.error('Etymology lookup error:', e);
      }
    } else {
      contentEl.setText("Highlight a word in your notes to search its etymology!");
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

async function fetchSpanishEtymology(word: string): Promise<string | null> {
  try {
    const normalizedWord = word.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const url = `https://etimologias.dechile.net/${encodeURIComponent(normalizedWord)}`;

    const response = await requestUrl({ url });

    if (response.status !== 200) return null;

    const html = response.text;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const contenidoDiv = doc.querySelector('#contenido');
    if (!contenidoDiv) return null;

    const paragraphs = contenidoDiv.querySelectorAll('p');
    let etymologyText = '';
    paragraphs.forEach(p => {
      const text = p.textContent?.trim();
      if (text && text.length > 20) {
        etymologyText += text + '\n\n';
      }
    });

    return etymologyText.trim() || null;

  } catch (e) {
    console.error('Error fetching Spanish etymology:', e);
    return null;
  }
}

export default class EtymologyLookupPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon(
      "sprout",
      "Etymology Lookup",
      (event: MouseEvent) => {
        const selection = getCurrentSelectedText(this.app);
        this.promptAndLookup(selection);
      }
    );

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
            item
              .setTitle(`Get etymology of "${ellipsis(selection, 18)}"`)
              .onClick(() => {
                this.promptAndLookup(selection);
              });
          });
        }
      })
    );
  }

  onunload() {}

  async promptAndLookup(selection: string | undefined) {
    if (!selection) {
      new Notice('Please select a word to look up its etymology.');
      return;
    }
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
    if (selection) return selection.trim();
  }
  const selection = document.getSelection()?.toString().trim();
  return selection || '';
}
