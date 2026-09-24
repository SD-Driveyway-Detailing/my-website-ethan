/* Measures the start of an SMS quote request, never text delivery or a booking. */
(() => {
  const sendTo = window.SDD_GOOGLE_ADS_SEND_TO || '';
  const configured = /^AW-\d+\/[A-Za-z0-9_-]+$/.test(sendTo);
  if (configured) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', sendTo.split('/')[0], { allow_ad_personalization_signals: false });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(sendTo.split('/')[0]);
    document.head.appendChild(script);
  }
  let counted = false;
  let fromAds = false;
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get('utm_source') === 'google' && query.get('utm_medium') === 'cpc') sessionStorage.setItem('sdd_google_ads_visit', '1');
    fromAds = sessionStorage.getItem('sdd_google_ads_visit') === '1';
  } catch (_) { /* Storage restrictions must never block texting. */ }
  window.sddOpenQuoteText = function(message) {
    if (configured && !counted) {
      counted = true;
      try {
        // No name, address, phone number, notes, or message content goes to Google.
        window.gtag('event', 'conversion', { send_to: sendTo });
      } catch (_) { /* Tracking failure must never block opening the SMS app. */ }
    }
    const attribution = fromAds ? '\n\nSource: Google ad' : '';
    // Keep this synchronous to preserve the user's gesture on mobile browsers.
    window.location.href = 'sms:4423036022?&body=' + encodeURIComponent(message + attribution);
  };
})();
