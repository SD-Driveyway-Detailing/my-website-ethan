(function () {
  'use strict';

  if (typeof window.sddTrackQuoteSubmission === 'function') return;

  var tagId = 'AW-18465209181';
  var destination = tagId + '/2zEOCPm3wrEdEN328uRE';
  var quoteTracked = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', tagId);

  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + tagId;
  document.head.appendChild(tag);

  // The quote form calls this only after the service confirms acceptance.
  // No name, phone number, vehicle, or quote text is sent to Google.
  window.sddTrackQuoteSubmission = function () {
    if (quoteTracked) return false;
    try {
      var transactionId = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : 'quote-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      window.gtag('event', 'conversion', {
        send_to: destination,
        transaction_id: transactionId
      });
      quoteTracked = true;
      return true;
    } catch (error) {
      // A measurement failure must not turn a submitted quote into a form error.
      return false;
    }
  };
}());
