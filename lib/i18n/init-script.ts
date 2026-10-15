/**
 * Sets <html lang> from the saved language before first paint, so screen
 * readers and font selection match. Kept free of imports: it is inlined.
 */
export const localeInitScript = `(function(){try{var p=JSON.parse(localStorage.getItem("expense-tracker:prefs")||"{}");var l=p&&p.state&&p.state.locale;if(l==="bn"||l==="en")document.documentElement.lang=l}catch(_){}})()`;
