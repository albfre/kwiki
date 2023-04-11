const wikiUrl = 'https://en.wiktionary.org';
const wikiApiDirectory = '/w/';
const wikiDirectory = '/wiki/';
const postPrefix = 'index.html?word=';
const apiFile = 'api.php'
const targetLanguage = 'Latin';
const parser = 'html.parser';
const wordForms = ['Verb', 'Noun', 'Adjective', 'Adverb', 'Participle', 'Pronoun', 'Determiner', 'Preposition', 'Numeral', 'Interjection', 'Conjunction', 'Particle', 'Suffix', 'Phrase', 'Idiom', 'Proverb', 'Letter'];
const labels = ['Alternative_forms', 'Etymology', 'Pronunciation', 'References', 'External links'];
const wordFormsAndLabels = [...wordForms, ...labels]
const baseFormClasses = ['form-of-definition-link']; // 'mention'
const sectionsToHighlight = ['Inflection', 'Declension', 'See_also'];
const sectionBreakClass = ['mw-headline'];
const abbreviations = {
    'first': '1st',
    'second': '2nd',
    'third': '3rd',
    'imperfect': 'imperf.',
    'future perfect': 'fut.perf.',
    'future\xa0perfect': 'fut.perf.',
    'pluperfect': 'plu.perf.',
    'passive': 'pass.',
    'active': 'act.',
    'singular': 'sing.',
    'plural': 'plur.',
    'non-finite forms': 'non-finite',
    'nominative': 'nom.',
    'genitive': 'gen.',
    'dative': 'dat.',
    'accusative': 'acc.',
    'ablative': 'abl.',
    'vocative': 'voc.',
    'possessive': 'poss.',
    'neuter': 'neut.',
    'feminine': 'fem.',
    'masculine': 'masc.',
    'reflexive': 'reflex.',
    'interrogative': 'interrog.',
    'indefinite': 'indef.',
};

class WordNotFoundError extends Error {}

function log(s) {
  if (true) {
    console.log(s);
  }
}


async function getDOM(word) {
  const path = wikiUrl + wikiApiDirectory + apiFile;
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=parse&origin=*&page=' + word + '&format=json'
  });
  const data = await response.json();

  if (data.error !== undefined) {
    throw new WordNotFoundError(word);
  }
  const htmlText = data.parse.text['*'];
  return new DOMParser().parseFromString(htmlText, 'text/html');
}

async function getLanguageSubsection(word, language = targetLanguage) {
  const soup = await getDOM(word);

  // Take tags from <span id="Language"> until <h2> or <hr>
  const selection = soup.querySelector(`span[id='${language}']`)
  if (!selection) {
    throw new WordNotFoundError(word)
  }
  let cur = selection.parentNode.nextElementSibling;
  const fragment = new DocumentFragment();
  while (cur && cur.tagName !== 'H2' && cur.tagName !== 'HR') {
    next = cur.nextSibling;
    fragment.appendChild(cur);
    cur = next;
  }
  return fragment
}

function selectWordForms(soup) {
  return soup.querySelectorAll(wordForms.map((a) => `span[id^="${a}"]`).join(','));
}

function selectFirstWordForm(soup) {
  return soup.querySelector(wordForms.map((a) => `span[id^="${a}"]`).join(','));
}

function selectEtymology(soup) {
  return soup.querySelectorAll('span[id^="Etymology"]');
}

function getWordForm(soup) {
  const w = selectFirstWordForm(soup).id;
  return wordForms.find((wf) => w.startsWith(wf));
}

function replaceNode(tag, newTagStr) {
  newNode = document.createElement(newTagStr);
  newNode.innerHTML = tag.innerHTML;
  newNode.id = tag.id;
  tag.replaceWith(newNode);
  return newNode;
}

function fixHeaders(soup) {
  for (const tag of selectWordForms(soup)) {
    parentNode = tag.parentNode;
    if (parentNode.tagName !== 'H3') {
      replaceNode(parentNode, 'h3');
    }
  }
  for (const tag of selectEtymology(soup)) {
    parentNode = tag.parentNode;
    if (parentNode.tagName !== 'H4') {
      replaceNode(parentNode, 'h4');
    }
  }
  for (const tag of soup.querySelectorAll('h5')) {
    replaceNode(tag, 'h4');
  }
}

function abbreviateGrammar(soup) {
  function replaceString(t) {
    if (!t || !t.textContent) return;
    const s = t.textContent.trim().toLowerCase();
    if (s in abbreviations) {
      t.textContent = abbreviations[s];
    }
  }

  for (const t of soup.querySelectorAll('table th')) {
    replaceString(t);
  }
  for (const t of soup.querySelectorAll('h3, h4, h5, h6')) {
    replaceString(t);
  }
}

function fixInternalLinks(soup) {
  soup.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href')?.toLowerCase();
    if (href) {
      if (href.startsWith(wikiDirectory) &&
          (href.includes(`#${targetLanguage.toLowerCase()}`) || !href.includes('#'))) {
        a.setAttribute('href', postPrefix + href.slice(wikiDirectory.length).split('#')[0]);
      } else if (!(href.startsWith('http') || href.startsWith('//'))) {
        a.setAttribute('href', `${postPrefix}${wikiUrl}${href}`);
      }
    }
  });
}

function* extractBaseWordForms(soup) {
  for (const x of soup.querySelectorAll('span')) {
    const cl = x.getAttribute('class')
    if (cl && baseFormClasses.some((b) => cl.includes(b))) {
      const a = x.querySelector('a');
      let href = a?.getAttribute('href');
      if (href) {
        if (href.startsWith(postPrefix)) {
          href = href.slice(postPrefix.length);
        }
        yield href;
      }
    }
  }
}

function removeWikiEdits(soup) {
  soup.querySelectorAll('span.mw-editsection').forEach((tag) => tag.remove());
}

function removeEmptyListElements(soup) {
  soup.querySelectorAll('li.mw-empty-elt').forEach((tag) => tag.remove());
}

function fixSelfLinks(word, soup) {
  soup.querySelectorAll('strong.selflink').forEach((tag) => {
    newNode = replaceNode(tag, 'a');
    newNode.setAttribute('href', word);
  });
}

async function getLanguagePart(word) {
  const soup = await getLanguageSubsection(word);
  abbreviateGrammar(soup);
  fixInternalLinks(soup);
  removeWikiEdits(soup);
  removeEmptyListElements(soup)
  fixHeaders(soup);
  fixSelfLinks(word, soup);
  return soup;
}

function hasIdStartingWithWordFormOrLabel(cur) {
  return cur.id && wordFormsAndLabels.some((prefix) => cur.id.startsWith(prefix));
}

function hasChildStartingWithWordFormOrLabel(cur) {
  if (hasIdStartingWithWordFormOrLabel(cur)) {
    return true;
  }
  let child = cur.firstElementChild;
  while (child) {
    if (hasIdStartingWithWordFormOrLabel(child)) {
      return true;
    }
    child = child.nextElementSibling;
  }
  return false;
}

function getWordFormFragment(soup) {
  const fragment = new DocumentFragment()
  let cur = soup.parentNode;
  do {
    next = cur.nextElementSibling;
    fragment.appendChild(cur);
    cur = next;
  } while (cur && !hasChildStartingWithWordFormOrLabel(cur));
  return fragment;
}

function getWordFormFragments(soups) {
  const fragments = [];
  for (const soup of soups) {
    const fragment = getWordFormFragment(soup);
    fragments.push(fragment);
  }
  return fragments;
}

async function getWordSoups(word) {
  const soup = await getLanguagePart(word);
  const wordForms = selectWordForms(soup);
  const wordFormFragments = getWordFormFragments(wordForms);

  const etymologys = selectEtymology(soup);
  log('etymology length: ' + etymologys.length)
  if (wordFormFragments.length === etymologys.length) {
    const etymologyFragments = getWordFormFragments(etymologys);
    log(etymologyFragments[0]);
    for (let i = 0; i < wordFormFragments.length; i++) {
      wordFormFragments[i].appendChild(etymologyFragments[i]);
    }
  }

  log("fragment length: " + wordFormFragments.length);
  log(wordFormFragments);
  return wordFormFragments;
}

async function getWordSoupGroups(word) {
  const wordSoups = await getWordSoups(word);
  const soupGroups = [];
  for (const wordSoup of wordSoups) {
    const group = [wordSoup];
    const wordForm = getWordForm(wordSoup);
    const baseWordForms = Array.from(new Set(extractBaseWordForms(wordSoup)));

    for (const baseWordForm of baseWordForms) {
      log('base form: ' + baseWordForm)
      const baseWordSoups = await getWordSoups(baseWordForm);
      for (const baseWordSoup of baseWordSoups) {
        if (getWordForm(baseWordSoup) === wordForm) {
          let w = selectFirstWordForm(baseWordSoup);
          w.innerHTML += ' [Base form]';
          group.push(baseWordSoup);
        }
      }
    }
    soupGroups.push(group)
  }
  return soupGroups;
}

async function renderTags(word) {
  const fragmentGroups = await getWordSoupGroups(word);
  log('fragment groups:')
  log(fragmentGroups)
  const fragments = []
  for (const fragmentGroup of fragmentGroups) {
    const resultFragment = new DocumentFragment();
    for (const fragment of fragmentGroup) {
      resultFragment.appendChild(fragment);
      resultFragment.appendChild(document.createElement('br'));
      resultFragment.appendChild(document.createElement('br'));
    }
    fragments.push(resultFragment);
  }

  return fragments;
}

async function handleWordFormSubmit(event) {
  event.preventDefault();
  const wordInput = document.getElementById('word-input');
  const resultTr = document.getElementById('resultTr');
  const resultDiv = document.getElementById('resultDiv');
  resultDiv.innerHTML = '';
  resultTr.innerHTML = '';
  const word = wordInput.value.trim().toLowerCase();
  if (!word) {
    return;
  }
  try {
    const results = await renderTags(word);
    log('results.length: ' + results.length)
    for (const result of results) {
      const td = document.createElement('td');
      td.className = 'light word-form-table';
      td.appendChild(result);
      resultTr.appendChild(td);
    }
  } catch (error) {
    if (error instanceof WordNotFoundError) {
      resultDiv.innerHTML = `Word not found: ${error.message}`;
    }
    else {
      resultDiv.innerHTML = `Error: ${error.message}`;
    }
  }
}

function handleAddress() {
  const params = new URLSearchParams(window.location.search);
  const message = params.get('word').trim();
  log(message);
  if (message !== '' && message.length < 1000) {
    const wordInput = document.getElementById('word-input');
    wordInput.value = message;
    const event = new Event("submit");
    handleWordFormSubmit(event);
    //const wordForm = document.getElementById('word-form');
    //wordForm.submit();

  }
}

const wordForm = document.getElementById('word-form');
if (!wordForm) {
  log('word form null')
}

wordForm.addEventListener('submit', handleWordFormSubmit);
window.onload = handleAddress;
