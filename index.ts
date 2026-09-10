import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent 保证 App 在原生与 Web 环境均正确注册
registerRootComponent(App);
