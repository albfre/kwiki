const wikiUrl = 'https://en.wiktionary.org';
const wikiApiDirectory = '/w/';
const wikiDirectory = '/wiki/';
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
};

async function getDOM(word) {
  const path = wikiUrl + wikiApiDirectory + apiFile;
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=parse&origin=*&page=' + word + '&format=json'
  });
  const data = await response.json();
  const htmlText = data.parse.text['*'];
  return new DOMParser().parseFromString(htmlText, 'text/html');
}

async function getLanguageSubsection(word, language = targetLanguage) {
  const soup = await getDOM(word);

  // Take tags from <span id="Language"> until <hr>
  let cur = soup.querySelector(`span[id='${language}']`).parentNode.nextElementSibling;
  const fragment = new DocumentFragment();
  while (cur && cur.tagName !== 'HR') {
    next = cur.nextSibling;
    fragment.appendChild(cur);
    cur = next;
  }
  return fragment
}

function selectFirstWordForm(soup) {
  return soup.querySelector(wordForms.map((a) => `span[id^="${a}"]`).join(','));
}

function getWordForm(soup) {
  const w = selectFirstWordForm(soup).id;
  return wordForms.find((wf) => w.startsWith(wf));
}

function fixHeaders(soup) {
  for (const tag of selectWordForms(soup)) {
    if (tag.parentNode.tagName === 'h4') {
      tag.parentNode.tagName = 'h3';
    }
  }
  for (const tag of soup.querySelectorAll('h5')) {
    tag.tagName = 'h4';
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

  for (const t of soup.querySelectorAll('table td')) {
    replaceString(t);
  }
  for (const t of soup.querySelectorAll('h3, h4, h5, h6')) {
    replaceString(t);
  }
}

function fixInternalLinks(soup) {
  soup.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href').toLowerCase();
    if (href.startsWith(wikiDirectory) &&
        (href.includes(`#${targetLanguage.toLowerCase()}`) || !href.includes('#'))) {
      a.setAttribute('href', href.slice(wikiDirectory.length).split('#')[0]);
    } else if (!(href.startsWith('http') || href.startsWith('//'))) {
      a.setAttribute('href', `${wikiUrl}${href}`);
    }
  });
}

function* extractBaseWordForms(soup) {
  for (const x of soup.querySelectorAll('span')) {
    const cl = x.getAttribute('class')
    if (cl && baseFormClasses.some((b) => cl.includes(b))) {
      const a = x.querySelector('a');
      if (a && a.getAttribute('href')) {
        yield a.getAttribute('href');
      }
    }
  }
}

function removeWikiEdits(soup) {
  soup.querySelectorAll('span.mw-editsection').forEach((tag) => tag.remove());
}

function fixSelfLinks(word, soup) {
  soup.querySelectorAll('strong.selflink').forEach((tag) => {
    tag.tagName = 'a';
    tag.setAttribute('href', word);
  });
}

async function getLanguagePart(word) {
  const soup = await getLanguageSubsection(word);
  //abbreviateGrammar(soup);
  fixInternalLinks(soup);
  removeWikiEdits(soup);
  //fixHeaders(soup);
  //fixSelfLinks(word, soup);
  return soup;
}

function hasIdStartingWithWordFormOrLabel(cur) {
  return cur.id && wordFormsAndLabels.some((prefix) => cur.id.startsWith(prefix));

}

async function getWordSoups(word) {
  console.log('ap1 ' + word);
  const soup = await getLanguagePart(word);
  console.log('ap2');
  let cur = selectFirstWordForm(soup).parentNode;
  console.log('ap3');
  console.log(soup);
  console.log('ap4');
  console.log(cur);
  const fragments = [];
  while (cur) {
    const fragment = new DocumentFragment()
    do {
      next = cur.nextSibling;
      fragment.appendChild(cur);
      cur = next;
    } while (cur && !hasIdStartingWithWordFormOrLabel(cur));
    fragments.push(fragment);
  }
  console.log("fragment length: " + fragments.length);
  console.log(fragments[0]);
  return fragments;
}

async function getWordSoupGroups(word) {
  const wordSoups = await getWordSoups(word);
  const soupGroups = [];
  for (const wordSoup of wordSoups) {
    soupGroups.push([wordSoup]);
    const wordForm = getWordForm(wordSoup);
    const baseWordForms = Array.from(new Set(extractBaseWordForms(wordSoup)));
    for (const baseWordForm of baseWordForms) {
  console.log('bep2-4')
  console.log(baseWordForm)
      const baseWordSoups = await getWordSoups(baseWordForm);
  console.log(baseWordSoups.length)
      for (const baseWordSoup of baseWordSoups) {
        if (getWordForm(baseWordSoup) === wordForm) {
          soupGroups[soupGroups.length - 1].push(baseWordSoup);
        }
      }
  console.log('bep2-6')
    }
  }
  console.log('bep3')
  console.log(soupGroups.length)
  return soupGroups;
}

async function renderTags(word) {
  const fragmentGroups = await getWordSoupGroups(word);
  console.log('groups')
  console.log(fragmentGroups)
  const fragments = []
  for (const fragmentGroup of fragmentGroups) {
    const resultFragment = new DocumentFragment();
    for (const fragment of fragmentGroup) {
      resultFragment.appendChild(fragment);
      resultFragment.appendChild(document.createElement('p'));
    }
    fragments.push(resultFragment);
  }

  return fragments[0];

/*
  return soupGroups
    .map((group) => group.map((s) => s.innerHTML).join('<p>'))
    .join('<br><b>-------------------</b>');
    */
}

async function handleWordFormSubmit(event) {
  event.preventDefault();
  const wordInput = document.getElementById('word-input');
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = '';
  const word = wordInput.value.trim().toLowerCase();
  if (!word) {
    return;
  }
  try {
    const result = await renderTags(word);
    resultDiv.appendChild(result)
    //resultDiv.innerHTML = JSON.stringify(result, null, 2);
    //console.log('inner: ' + resultDiv.innerHTML)
  } catch (error) {
    resultDiv.innerHTML = `Error: ${error.message}`;
  }
}

const wordForm = document.getElementById('word-form');
if (!wordForm) {
  console.log('word form null')
}
wordForm.addEventListener('submit', handleWordFormSubmit);
