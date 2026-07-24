import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const navigation = [
  { href: "#programs", label: "Направления" },
  { href: "#process", label: "Как учим" },
  { href: "#advantages", label: "Почему мы" },
  { href: "#faq", label: "Вопросы" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="topline">
        <span className="topline__dot" />
        Идёт набор в новые группы
        <a href="#request">Узнать о старте</a>
      </div>

      <header className={`header${scrolled ? " header--scrolled" : ""}`}>
        <div className="container header__inner">
          <a className="logo" href="#top" aria-label="СМЕНА — на главную">
            <span className="logo__mark">С</span>
            <span>
              <strong>СМЕНА</strong>
              <small>центр подготовки</small>
            </span>
          </a>

          <nav
            className={`nav${menuOpen ? " nav--open" : ""}`}
            aria-label="Основная навигация"
          >
            {navigation.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
          </nav>

          <a className="button button--small header__cta" href="#request">
            Подобрать программу
          </a>

          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>
    </>
  );
}
