import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import CopilotPlugin from "../main";
import * as child_process from "child_process";
import AuthModal from "../modal/AuthModal";

import { StrictMode } from "react";
import { Root, createRoot } from "react-dom/client";
import KeybindingInput from "../components/KeybindingInput";

export interface SettingsObserver {
	updateSettings(): void;
}

export type Hotkeys = {
	accept: string;
	cancel: string;
};

export interface CopilotPluginSettings {
	nodePath: string;
	enabled: boolean;
	hotkeys: Hotkeys;
}

export const DEFAULT_SETTINGS: CopilotPluginSettings = {
	nodePath: "default",
	enabled: true,
	hotkeys: {
		accept: "Tab",
		cancel: "Escape",
	},
};

class CopilotPluginSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;
	private observers: SettingsObserver[] = [];
	root: Root | null = null;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Node binary path")
			.setDesc(
				"The path to your node binary (at least Node v18). This is used to run the copilot server.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter the path to your node binary.")
					.setValue(this.plugin.settings.nodePath)
					.onChange(async (value) => {
						this.plugin.settings.nodePath = value;
						await this.saveSettings();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Test the path")
					.onClick(async () => this.testNodePath()),
			);

		this.root = createRoot(
			containerEl.createEl("div", {
				cls: "copilot-settings-hotkeys-container",
			}),
		);

		const bindings = [
			{
				title: "Accept suggestion",
				description: "Keybinding to accept copilot suggestions.",
				value: this.plugin.settings.hotkeys.accept,
				onChange: (value: string) => {
					this.plugin.settings.hotkeys.accept = value;
				},
				defaultValue: DEFAULT_SETTINGS.hotkeys.accept,
			},
			{
				title: "Cancel suggestion",
				description: "Keybinding to cancel copilot suggestions.",
				value: this.plugin.settings.hotkeys.cancel,
				onChange: (value: string) => {
					this.plugin.settings.hotkeys.cancel = value;
				},
				defaultValue: DEFAULT_SETTINGS.hotkeys.cancel,
			},
		];

		this.root.render(
			<StrictMode>
				<h3>Keybindings</h3>
				<p className="copilot-settings-note">
					Be aware that not all keybindings will work as some are
					already defined and used by other plugins.
				</p>
				{bindings.map((binding, index) => (
					<KeybindingInput
						key={index}
						title={binding.title}
						description={binding.description}
						value={binding.value}
						onChange={binding.onChange}
						defaultValue={binding.defaultValue}
					/>
				))}
				<button
					className="mod-cta copilot-settings-save-button"
					onClick={() => {
						this.saveSettings().then(() => {
							this.plugin.app.workspace.updateOptions();
						});
					}}
				>
					Save keybindings
				</button>
			</StrictMode>,
		);

		new Setting(containerEl)
			.addButton((button) =>
				button
					.setButtonText("Restart sign-in process")
					.onClick(async () => {
						console.log("Restarting sign-in process");
						this.plugin.copilotAgent
							.getClient()
							.initiateSignIn()
							.then((res) => {
								if (res.status === "AlreadySignedIn") {
									new Notice("You are already signed in.");
								} else {
									new AuthModal(
										this.plugin,
										res.userCode,
										res.verificationUri,
									).open();
								}
							});
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Sign out")
					.setWarning()
					.onClick(async () => {
						this.plugin.copilotAgent.getClient().signOut();
						new Notice("Signed out successfully.");
					}),
			);
	}

	public hide(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	public registerObserver(observer: SettingsObserver) {
		this.observers.push(observer);
	}

	private notifyObservers() {
		for (const observer of this.observers) {
			observer.updateSettings();
		}
	}

	public async loadSettings() {
		this.plugin.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.plugin.loadData(),
		);
	}

	public async saveSettings(notify = true): Promise<void> {
		await this.plugin.saveData(this.plugin.settings);
		if (notify) this.notifyObservers();
		return Promise.resolve();
	}

	public isCopilotEnabled(): boolean {
		return this.plugin.settings.enabled;
	}

	public async testNodePath(): Promise<void> {
		const nodePath = this.plugin.settings.nodePath;

		try {
			const result = await new Promise<string>((resolve, reject) => {
				const nodeProcess = child_process.spawn(nodePath, [
					"--version",
				]);
				let output = "";

				nodeProcess.stdout.on("data", (data) => {
					output += data.toString();
				});

				nodeProcess.on("close", (code) => {
					if (code === 0) {
						resolve(output.trim());
					} else {
						reject(
							new Error(`Node process exited with code ${code}`),
						);
					}
				});

				nodeProcess.on("error", (err) => {
					reject(err);
				});
			});

			const nodeVersion = result.slice(1);
			const requiredVersion = 18;

			if (parseFloat(nodeVersion) >= requiredVersion) {
				new Notice(
					`Node.js path is valid and the version ${nodeVersion} is compatible.`,
				);
			} else {
				new Notice(
					`Node.js path is valid, but the version ${nodeVersion} is not compatible. Please use Node.js v${requiredVersion} or later.`,
				);
			}
		} catch (err) {
			new Notice(`Error while testing the Node.js path: ${err.message}`);
		}
	}
}

export default CopilotPluginSettingTab;