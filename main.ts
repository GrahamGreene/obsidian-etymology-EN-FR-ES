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
      console.log('User selected English for:', this.selection);
      this.onSubmit('en');
      this.close();
    });
    buttonContainer.createEl('button', { text: 'Spanish' }).addEventListener('click', () => {
      console.log('User selected Spanish for:', this.selection);
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

    console.log('Etymology lookup for:', this.data, 'in language:', this.lang);

    if (this.data) {
      try {
        const searchTerm = this.data.trim();
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
      } catch (_e) {
        contentEl.setText("Search failed. Are you connected to the internet?");
        console.error('Etymology lookup error:', _e);
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
    const url = `https://etimologias.dechile.net/?${encodeURIComponent(word)}`;
    const response = await requestUrl({ url });
    if (response.status !== 200) {
      console.log('Spanish etymology fetch failed, status:', response.status);
      return null;
    }

    const html = response.text;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const contenido = doc.querySelector('#contenido') ?? doc.querySelector('.cont');
    if (!contenido) {
      console.log('No etymology content found for:', word);
      return null;
    }

    return contenido.textContent?.trim() ?? null;
  } catch (e) {
    console.error('Error fetching Spanish etymology:', e);
    return null;
  }
}

export default class EtymologyLookupPlugin extends Plugin {
  async onload() {
    console.log("Loading Etymology Lookup plugin");

    this.addRibbonIcon(
      "sprout",
      "Etymology Lookup",
      (event: MouseEvent) => {
        const selection = getCurrentSelectedText(this.app);
        console.log('Ribbon icon clicked, selection:', selection);
        this.promptAndLookup(selection);
      }
    );

    this.addCommand({
      id: "search",
      name: "Search Etymology",
      callback: () => {
        const selection = getCurrentSelectedText(this.app);
        console.log('Command triggered, selection:', selection);
        this.promptAndLookup(selection);
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection();
        console.log('Context menu opened, selection:', selection);
        if (selection) {
          menu.addItem((item) => {
            item.setTitle(`Get etymology of "${ellipsis(selection, 18)}"`).onClick(() => {
              console.log('Context menu item clicked, selection:', selection);
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
    console.log('Editor selection:', selection);
    if (selection) return selection.trim();
  }

  const selection = document.getSelection()?.toString().trim();
  console.log('Document selection:', selection);
  return selection || '';
}
