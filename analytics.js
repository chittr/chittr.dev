// Google Analytics (gtag.js) for the production site only, so local previews,
// tests and branch deployments don't record page views.
if (['chittr.dev', 'www.chittr.dev'].includes(location.hostname)) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', 'G-0TB5SDN8SH');
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=G-0TB5SDN8SH';
  document.head.append(tag);
}
