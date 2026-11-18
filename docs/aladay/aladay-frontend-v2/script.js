/* ALADAY V2 — Interações locais. Sem dependências e sem credenciais. */
(() => {
  'use strict';

  const rawConfig = window.ALADAY_CONFIG || {};
  const products = {
    burger: { name: 'Hambúrguer especial', cents: 2990 },
    pizza: { name: 'Pizza artesanal', cents: 4990 },
    acai: { name: 'Açaí especial', cents: 1990 }
  };
  const cart = { burger: 0, pizza: 0, acai: 0 };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const toMoney = cents => money.format(cents / 100);

  function safeUrl(value, allowedProtocols = ['https:', 'http:']) {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value, window.location.href);
      // Na produção, endpoints externos devem ser HTTPS. O localhost pode usar HTTP.
      if (!allowedProtocols.includes(url.protocol)) return '';
      if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && window.location.protocol !== 'file:') return '';
      return url.href;
    } catch { return ''; }
  }

  const config = {
    loginUrl: safeUrl(rawConfig.loginUrl),
    signupUrl: safeUrl(rawConfig.signupUrl),
    leadEndpoint: safeUrl(rawConfig.leadEndpoint),
    whatsappNumber: String(rawConfig.whatsappNumber || '').replace(/\D/g, '')
  };

  function initNavigation() {
    const loginLinks = $$('[data-login]');
    // Sem rota autenticada confirmada, não mostramos um link "Entrar" fictício.
    loginLinks.forEach(link => { if (config.loginUrl) link.href = config.loginUrl; else link.hidden = true; });
    if (config.signupUrl) $$('[data-signup]').forEach(link => { link.href = config.signupUrl; });

    const toggle = $('.mobile-toggle');
    const menu = $('#mobile-menu');
    function closeMenu() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menu');
      $('use', toggle)?.setAttribute('href', '#i-menu');
      document.body.classList.remove('menu-open');
    }
    toggle?.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      $('use', toggle)?.setAttribute('href', open ? '#i-x' : '#i-menu');
      document.body.classList.toggle('menu-open', open);
    });
    $$('a', menu).forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 950) closeMenu(); });
    $('#year').textContent = String(new Date().getFullYear());
  }

  const toast = $('#toast');
  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3400);
  }

  function initDemo() {
    const tabs = $$('.demo-tab');
    const productCards = $$('.demo-product');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      const category = tab.dataset.category;
      tabs.forEach(item => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      productCards.forEach(card => { card.hidden = category !== 'todos' && card.dataset.category !== category; });
    }));

    function cartCount() { return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0); }
    function cartTotal() { return Object.keys(cart).reduce((sum, id) => sum + cart[id] * products[id].cents, 0); }
    function updateCart() {
      $('#cart-badge').textContent = String(cartCount());
      $('#mini-cart-count').textContent = String(cartCount());
      $('#cart-total').textContent = toMoney(cartTotal());
      const list = $('#cart-items');
      list.replaceChildren();
      if (!cartCount()) {
        const empty = document.createElement('p');
        empty.className = 'empty-cart';
        empty.textContent = 'Seu carrinho está vazio.';
        list.append(empty);
      }
      for (const [id, quantity] of Object.entries(cart)) {
        if (!quantity) continue;
        const row = document.createElement('div');
        row.className = 'cart-item';
        const name = document.createElement('span');
        name.className = 'cart-item-name';
        name.textContent = products[id].name;
        const controls = document.createElement('div');
        controls.className = 'cart-controls';
        const minus = document.createElement('button');
        minus.type = 'button';
        minus.setAttribute('aria-label', `Remover uma unidade de ${products[id].name}`);
        minus.dataset.decrement = id;
        minus.textContent = '−';
        const quantityText = document.createElement('span');
        quantityText.textContent = String(quantity);
        const plus = document.createElement('button');
        plus.type = 'button';
        plus.setAttribute('aria-label', `Adicionar uma unidade de ${products[id].name}`);
        plus.dataset.increment = id;
        plus.textContent = '+';
        controls.append(minus, quantityText, plus);
        const price = document.createElement('strong');
        price.className = 'cart-item-price';
        price.textContent = toMoney(quantity * products[id].cents);
        row.append(name, controls, price);
        list.append(row);
      }
      $('#simulate-order').disabled = !cartCount();
      $('#clear-cart').disabled = !cartCount();
    }

    $$('[data-add]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.add;
      if (!(id in cart)) return;
      cart[id]++;
      updateCart();
      showToast(`${products[id].name} adicionado ao carrinho de demonstração.`);
    }));
    $('#cart-items').addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      const add = button.dataset.increment;
      const decrement = button.dataset.decrement;
      if (add in cart) cart[add]++;
      if (decrement in cart) cart[decrement] = Math.max(0, cart[decrement] - 1);
      updateCart();
    });
    const toggle = $('.demo-cart-toggle');
    const details = $('#cart-details');
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden;
      toggle.setAttribute('aria-expanded', String(!details.hidden));
    });
    $('#clear-cart').addEventListener('click', () => {
      for (const id of Object.keys(cart)) cart[id] = 0;
      updateCart();
      showToast('Carrinho da demonstração limpo.');
    });
    $('#simulate-order').addEventListener('click', () => {
      if (!cartCount()) return;
      showToast(`Simulação concluída! ${cartCount()} item(ns), ${toMoney(cartTotal())}. Nenhum pedido foi enviado.`);
    });
    updateCart();
  }

  function initContact() {
    const form = $('#lead-form');
    const feedback = $('#form-feedback');
    const phone = $('[name="phone"]', form);
    const submit = $('.form-submit', form);
    const wa = $('#whatsapp-contact');

    if (/^\d{12,15}$/.test(config.whatsappNumber)) {
      wa.href = `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent('Olá! Tenho interesse em conhecer a plataforma Aladay.')}`;
      wa.hidden = false;
    }

    function status(message, type) {
      feedback.textContent = message;
      feedback.className = `form-feedback ${type}`;
    }
    function validField(field) {
      let valid = field.checkValidity();
      if (field.name === 'phone') {
        const digits = field.value.replace(/\D/g, '');
        valid = digits.length >= 10 && digits.length <= 13;
      }
      field.setAttribute('aria-invalid', String(!valid));
      return valid;
    }
    $$('input:not([name="website"]),select', form).forEach(field => {
      field.addEventListener('input', () => { validField(field); if (feedback.classList.contains('error')) status('', ''); });
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if ($('[name="website"]', form).value) return;
      const fields = $$('input[required],select[required]', form);
      if (!fields.every(validField)) {
        status('Confira seu nome, o nome do restaurante, WhatsApp com DDD e tipo de negócio.', 'error');
        const invalid = fields.find(field => field.getAttribute('aria-invalid') === 'true');
        invalid?.focus();
        return;
      }
      if (!config.leadEndpoint) {
        status('Este formulário está em modo de prévia. Para receber os dados, configure o leadEndpoint no arquivo config.js com uma rota real e segura da Aladay.', 'info');
        return;
      }
      const payload = {
        name: $('[name="name"]', form).value.trim(),
        restaurant: $('[name="restaurant"]', form).value.trim(),
        phone: phone.value.replace(/\D/g, ''),
        segment: $('[name="segment"]', form).value,
        source: 'landing-v2'
      };
      submit.disabled = true;
      submit.textContent = 'Enviando...';
      status('', '');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(config.leadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'omit',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        status('Recebemos seu interesse! Nossa equipe poderá entrar em contato pelo WhatsApp informado.', 'success');
        form.reset();
        fields.forEach(field => field.removeAttribute('aria-invalid'));
      } catch {
        status('Não foi possível enviar agora. Tente novamente mais tarde ou use o WhatsApp, se disponível.', 'error');
      } finally {
        window.clearTimeout(timeout);
        submit.disabled = false;
        submit.replaceChildren(document.createTextNode('Quero conhecer a Aladay '));
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('class', 'icon');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#i-arrow');
        icon.append(use);
        submit.append(icon);
      }
    });
  }

  function initReveal() {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const style = document.createElement('style');
    style.textContent = '.has-motion .reveal:not(.is-visible){opacity:0;transform:translateY(12px)}.has-motion .reveal{transition:opacity .6s ease,transform .6s ease}';
    document.head.append(style);
    const elements = $$('.reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
    }, { threshold: .06, rootMargin: '0px 0px 70px 0px' });
    // Ativa após a primeira pintura para impedir conteúdo invisível caso JS falhe.
    requestAnimationFrame(() => { document.body.classList.add('has-motion'); elements.forEach(element => observer.observe(element)); });
  }

  initNavigation();
  initDemo();
  initContact();
  initReveal();
})();
