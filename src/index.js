import { createStore, combineReducers, bindActionCreators, applyMiddleware, compose } from 'redux';
import Immutable from 'immutable';
import { createProvider } from 'react-redux';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';

import * as dataReducers from './reducers/dataReducer';
import components from './components';
import settingsComponentObjects from './settingsComponentObjects';
import * as selectors from './selectors/dataSelectors';

import { buildGriddleReducer, buildGriddleComponents } from './utils/compositionUtils';
import { getColumnProperties } from './utils/columnUtils';
import { getRowProperties } from './utils/rowUtils';
import { setSortProperties } from './utils/sortUtils';
import { StoreListener } from './utils/listenerUtils';
import * as actions from './actions';

const defaultEvents = {
  ...actions,
  onFilter: actions.setFilter,
  setSortProperties
};


const defaultStyleConfig = {
  icons: {
    TableHeadingCell: {
      sortDescendingIcon: '▼',
      sortAscendingIcon: '▲'
    },
  },
  classNames: {
    Cell: 'griddle-cell',
    Filter: 'griddle-filter',
    Loading: 'griddle-loadingResults',
    NextButton: 'griddle-next-button',
    NoResults: 'griddle-noResults',
    PageDropdown: 'griddle-page-select',
    Pagination: 'griddle-pagination',
    PreviousButton: 'griddle-previous-button',
    Row: 'griddle-row',
    RowDefinition: 'griddle-row-definition',
    Settings: 'griddle-settings',
    SettingsToggle: 'griddle-settings-toggle',
    Table: 'griddle-table',
    TableBody: 'griddle-table-body',
    TableHeading: 'griddle-table-heading',
    TableHeadingCell: 'griddle-table-heading-cell',
    TableHeadingCellAscending: 'griddle-heading-ascending',
    TableHeadingCellDescending: 'griddle-heading-descending',
  },
  styles: {
  }
};

class Griddle extends Component {
  static childContextTypes = {
    components: PropTypes.object.isRequired,
    settingsComponentObjects: PropTypes.object,
    events: PropTypes.object,
    selectors: PropTypes.object,
    storeKey: PropTypes.string,
    storeListener: PropTypes.object
  }

  constructor(props) {
    super(props);

    const {
      plugins=[],
      data,
      children:rowPropertiesComponent,
      events={},
      sortProperties={},
      styleConfig={},
      pageProperties:importedPageProperties,
      components:userComponents,
      renderProperties:userRenderProperties={},
      settingsComponentObjects:userSettingsComponentObjects,
      storeKey = Griddle.storeKey || 'store',
      reduxMiddleware = [],
      listeners = {},
      ...userInitialState
    } = props;

    const rowProperties = getRowProperties(rowPropertiesComponent);
    const columnProperties = getColumnProperties(rowPropertiesComponent);

    //Combine / compose the reducers to make a single, unified reducer
    const reducers = buildGriddleReducer([dataReducers, ...plugins.map(p => p.reducer)]);

    //Combine / Compose the components to make a single component for each component type
    this.components = buildGriddleComponents([components, ...plugins.map(p => p.components), userComponents]);

    this.settingsComponentObjects = Object.assign({}, settingsComponentObjects, ...plugins.map(p => p.settingsComponentObjects), userSettingsComponentObjects);

    this.events = Object.assign({}, events, ...plugins.map(p => p.events));

    this.selectors = plugins.reduce((combined, plugin) => ({ ...combined, ...plugin.selectors }), {...selectors});

    const mergedStyleConfig = _.merge({}, defaultStyleConfig, ...plugins.map(p => p.styleConfig), styleConfig);

    const pageProperties = Object.assign({}, {
        currentPage: 1,
        pageSize: 10
      },
      importedPageProperties,
    );

    //TODO: This should also look at the default and plugin initial state objects
    const renderProperties = Object.assign({
      rowProperties,
      columnProperties
    }, ...plugins.map(p => p.renderProperties), userRenderProperties);

    // TODO: Make this its own method
    const initialState = _.merge(
      {
        enableSettings: true,
        textProperties: {
          next: 'Next',
          previous: 'Previous',
          settingsToggle: 'Settings'
        },
      },
      ...plugins.map(p => p.initialState),
      userInitialState,
      {
        data,
        pageProperties,
        renderProperties,
        sortProperties,
        styleConfig: mergedStyleConfig,
      }
    );

    const composeEnhancers = (typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__) || compose
    this.store = createStore(
      reducers,
      initialState,
      composeEnhancers(
        applyMiddleware(..._.compact(_.flatten(plugins.map(p => p.reduxMiddleware))), ...reduxMiddleware)
      )
    );

    this.provider = createProvider(storeKey);

    const sanitizedListeners = _.pickBy(listeners, (value, key) => typeof value === "function");
    this.listeners = plugins.reduce((combined, plugin) => ({...combined, ..._.pickBy(plugin.listeners, (value, key) => typeof value === "function")}), {...sanitizedListeners});
    this.storeListener = new StoreListener(this.store);
    _.forIn(this.listeners, (listener, name) => {
      this.storeListener.addListener(listener, name, {events: this.events, selectors: this.selectors});
    });
  }

  componentWillReceiveProps(nextProps) {
    const newState = _.pickBy(nextProps, (value, key) => {
      return this.props[key] !== value;
    })

    // Only update the state if something has changed.
    if (Object.keys(newState).length > 0) {
     this.store.dispatch(actions.updateState(newState));
    }
  }

  shouldComponentUpdate() {
    // As relevant property updates are captured in `componentWillReceiveProps`.
    // return false to prevent the the entire root node from being deleted.
    return false;
  }

  getStoreKey = () => {
    return this.props.storeKey || Griddle.storeKey || 'store';
  }

  getChildContext() {
    return {
      components: this.components,
      settingsComponentObjects: this.settingsComponentObjects,
      events: this.events,
      selectors: this.selectors,
      storeKey: this.getStoreKey(),
      storeListener: this.storeListener
    };
  }

  render() {
    return (
      <this.provider store={this.store}>
        <this.components.Layout />
      </this.provider>
    )

  }
}

Griddle.storeKey = 'store';

export default Griddle;
