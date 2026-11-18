import './siteChromeV2.css';

export const LANDING_NAV_ITEMS = [
  { label: 'Recursos', id: 'recursos' },
  { label: 'Como funciona', id: 'como-funciona' },
  { label: 'Aladay AI', id: 'aladay-ai' },
  { label: 'Planos', id: 'planos' },
  { label: 'Dúvidas', id: 'duvidas' },
] as const;

export function SiteBrandV2({ className = '' }: { className?: string }) {
  return (
    <span className={`site-v2-brand ${className}`}>
      <svg className="site-v2-brand-symbol" viewBox="0 0 42 42" aria-hidden="true">
        <path d="M20.7 4 38 35H28l-7.3-14-6 11h10l-4.4 7H3L20.7 4Z" fill="currentColor" />
      </svg>
      <span className="site-v2-wordmark">ala<span>day</span></span>
    </span>
  );
}

interface SiteFooterV2Props {
  onSection: (id: string) => void;
  onLogin: () => void;
  onStartTrial: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  onSupport: () => void;
  isAuthenticated?: boolean;
}

export function SiteFooterV2({
  onSection, onLogin, onStartTrial, onTerms, onPrivacy, onSupport, isAuthenticated = false,
}: SiteFooterV2Props) {
  const sectionLink = (label: string, id: string) => (
    <a href={`#${id}`} onClick={(event) => { event.preventDefault(); onSection(id); }}>{label}</a>
  );
  const legalLink = (label: string, href: string, onNavigate: () => void) => (
    <a href={href} onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate();
    }}>{label}</a>
  );

  return (
    <footer className="site-v2-footer" aria-label="Rodapé Aladay">
      <div className="site-v2-footer-shell">
        <div className="site-v2-footer-top">
          <div className="site-v2-footer-brand">
            <a href="#topo" onClick={(event) => { event.preventDefault(); onSection('topo'); }} aria-label="Aladay, voltar ao topo">
              <SiteBrandV2 />
            </a>
            <p>Tecnologia que aproxima<br />restaurantes e clientes.</p>
          </div>
          <nav className="site-v2-footer-columns" aria-label="Navegação do rodapé">
            <div>
              <strong>Explore</strong>
              {sectionLink('Recursos', 'recursos')}
              {sectionLink('Como funciona', 'como-funciona')}
              {sectionLink('Demonstração', 'demonstracao-celular')}
              {sectionLink('Calculadora de economia', 'calculadora')}
            </div>
            <div>
              <strong>Plataforma</strong>
              {sectionLink('Aladay AI', 'aladay-ai')}
              {sectionLink('Planos', 'planos')}
              {sectionLink('Dúvidas frequentes', 'duvidas')}
            </div>
            <div>
              <strong>Comece</strong>
              <button type="button" onClick={onStartTrial}>Solicitar teste</button>
              <button type="button" onClick={onLogin}>{isAuthenticated ? 'Meu painel' : 'Entrar na plataforma'}</button>
              <button type="button" onClick={onSupport}>Atendimento</button>
            </div>
            <div>
              <strong>Informações</strong>
              {legalLink('Termos de Uso', '/terms', onTerms)}
              {legalLink('Política de Privacidade', '/privacy', onPrivacy)}
            </div>
          </nav>
        </div>
        <div className="site-v2-footer-bottom">
          <span>© {new Date().getFullYear()} Aladay. Todos os direitos reservados.</span>
          <span>Feito para simplificar o dia a dia de quem empreende. ✳</span>
          <a href="#topo" onClick={(event) => { event.preventDefault(); onSection('topo'); }}>Voltar ao topo ↑</a>
        </div>
      </div>
    </footer>
  );
}
