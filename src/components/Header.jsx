import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const navigation = [
  { to: "/#programs", label: "Направления" },
  { to: "/#process", label: "Как учим" },
  { to: "/#advantages", label: "Почему мы" },
  { to: "/#faq", label: "Вопросы" },
  { to: "/documents", label: "Документы" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

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
        <Link to="/#request">Узнать о старте</Link>
      </div>

      <header
        className={`header${isHome ? "" : " header--document"}${
          scrolled ? " header--scrolled" : ""
        }`}
      >
        <div className="container header__inner">
          <Link className="logo" to="/" aria-label="СМЕНА — на главную">
            <span className="logo__mark">С</span>
            <span>
              <strong>СМЕНА</strong>
              <small>центр подготовки</small>
            </span>
          </Link>

          <nav
            className={`nav${menuOpen ? " nav--open" : ""}`}
            aria-label="Основная навигация"
          >
            {navigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={
                  item.to === "/documents" &&
                  location.pathname.startsWith("/documents")
                    ? "page"
                    : undefined
                }
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link className="button button--small header__cta" to="/#request">
            Подобрать программу
          </Link>

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
