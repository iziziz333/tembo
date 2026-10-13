// Runs before first paint: the glass look needs a transparent page from the start.
if (new URLSearchParams(location.search).get('glass') === '1') document.documentElement.classList.add('glass');
