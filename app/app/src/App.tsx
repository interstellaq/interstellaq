import { labPrefix } from "@stellar-scaffold/app-lib"
import { NavLink, Outlet, Route, Routes } from "react-router-dom"
import styles from "./App.module.css"
import ConnectAccount from "./components/ConnectAccount"
import Home from "./pages/Home"
import InvoicePage from "./pages/InvoicePage"
import Merchant from "./pages/Merchant"

function App() {
	return (
		<Routes>
			<Route element={<AppLayout />}>
				<Route path="/" element={<Home />} />
				<Route path="/comercio" element={<Merchant />} />
				<Route path="/factura/:address/:id" element={<InvoicePage />} />
			</Route>
		</Routes>
	)
}

const AppLayout = () => (
	<div className={styles.AppLayout}>
		<header className={styles.header}>
			<NavLink to="/" className={styles.logo}>
				InterstellaQ
			</NavLink>
			<nav className={styles.headerNav}>
				<NavLink
					to="/comercio"
					className={({ isActive }) => (isActive ? styles.active : "")}
				>
					Panel del comercio
				</NavLink>
				<a href={labPrefix()} target="_blank" rel="noreferrer">
					Explorador de transacciones
				</a>
			</nav>
			<ConnectAccount />
		</header>

		<main className={styles.main}>
			<Outlet />
		</main>

		<footer className={styles.footer}>
			<nav className={styles.footerNav}>
				<a
					href="https://stellar.org/developers/edps/sep-0007"
					target="_blank"
					rel="noreferrer"
				>
					SEP-7
				</a>
				<a
					href="https://stellar.expert/testnet"
					target="_blank"
					rel="noreferrer"
				>
					stellar.expert Testnet
				</a>
				<a
					href="https://developers.stellar.org"
					target="_blank"
					rel="noreferrer"
				>
					Documentación de Stellar
				</a>
			</nav>
		</footer>
	</div>
)

export default App
