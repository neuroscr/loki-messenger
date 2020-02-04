import React from 'react';
import { AutoSizer, List } from 'react-virtualized';

import {
  ConversationListItem,
  PropsData as ConversationListItemPropsType,
} from '../ConversationListItem';

import { LeftPane, RowRendererParamsType } from '../LeftPane';
import {
  SessionButton,
  SessionButtonColor,
  SessionButtonType,
} from './SessionButton';
import {
  PropsData as SearchResultsProps,
  SearchResults,
} from '../SearchResults';
import { SearchOptions } from '../../types/Search';
import { debounce } from 'lodash';
import { cleanSearchTerm } from '../../util/cleanSearchTerm';
import { SessionSearchInput } from './SessionSearchInput';
import { SessionClosableOverlay } from './SessionClosableOverlay';
import { MainViewController } from '../MainViewController';

export interface Props {
  searchTerm: string;
  isSecondaryDevice: boolean;

  conversations?: Array<ConversationListItemPropsType>;

  searchResults?: SearchResultsProps;

  updateSearchTerm: (searchTerm: string) => void;
  search: (query: string, options: SearchOptions) => void;
  openConversationInternal: (id: string, messageId?: string) => void;
  clearSearch: () => void;
}

interface State {
  showAddChannelView: boolean;
  channelUrlPasted: string;
  loading: boolean;
  connectSuccess: boolean;
}

export class LeftPaneChannelSection extends React.Component<Props, State> {
  private readonly updateSearchBound: (searchedString: string) => void;
  private readonly debouncedSearch: (searchTerm: string) => void;

  public constructor(props: Props) {
    super(props);
    this.state = {
      showAddChannelView: false,
      channelUrlPasted: '',
      loading: false,
      connectSuccess: false,
    };

    this.handleOnPasteUrl = this.handleOnPasteUrl.bind(this);
    this.handleJoinChannelButtonClick = this.handleJoinChannelButtonClick.bind(
      this
    );
    this.handleToggleOverlay = this.handleToggleOverlay.bind(this);
    this.updateSearchBound = this.updateSearch.bind(this);
    this.debouncedSearch = debounce(this.search.bind(this), 20);
  }

  public componentWillUnmount() {
    this.updateSearch('');
  }

  public getCurrentConversations():
    | Array<ConversationListItemPropsType>
    | undefined {
    const { conversations } = this.props;

    let conversationList = conversations;
    if (conversationList !== undefined) {
      conversationList = conversationList.filter(
        // a channel is either a public group or a rss group
        conversation =>
          conversation.type === 'group' &&
          (conversation.isPublic ||
            (conversation.lastMessage && conversation.lastMessage.isRss))
      );
    }

    return conversationList;
  }

  public renderRow = ({
    index,
    key,
    style,
  }: RowRendererParamsType): JSX.Element => {
    const { openConversationInternal } = this.props;

    const conversations = this.getCurrentConversations();

    if (!conversations) {
      throw new Error('renderRow: Tried to render without conversations');
    }

    const conversation = conversations[index];

    return (
      <ConversationListItem
        key={key}
        style={style}
        {...conversation}
        onClick={openConversationInternal}
        i18n={window.i18n}
      />
    );
  };

  public renderList(): JSX.Element | Array<JSX.Element | null> {
    const { openConversationInternal, searchResults } = this.props;

    if (searchResults) {
      return (
        <SearchResults
          {...searchResults}
          openConversation={openConversationInternal}
          i18n={window.i18n}
        />
      );
    }

    const conversations = this.getCurrentConversations();

    if (!conversations) {
      throw new Error(
        'render: must provided conversations if no search results are provided'
      );
    }

    const length = conversations.length;

    // Note: conversations is not a known prop for List, but it is required to ensure that
    //   it re-renders when our conversation data changes. Otherwise it would just render
    //   on startup and scroll.
    const list = (
      <div className="module-left-pane__list" key={0}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              className="module-left-pane__virtual-list"
              conversations={conversations}
              height={height}
              rowCount={length}
              rowHeight={64}
              rowRenderer={this.renderRow}
              width={width}
              autoHeight={true}
            />
          )}
        </AutoSizer>
      </div>
    );

    return [list];
  }

  public renderHeader(): JSX.Element {
    const labels = [window.i18n('groups')];

    return LeftPane.RENDER_HEADER(labels, null);
  }

  public componentDidMount() {
    MainViewController.renderMessageView();
  }

  public componentDidUpdate() {
    MainViewController.renderMessageView();
  }

  public render(): JSX.Element {
    return (
      <div className="session-left-pane-section-content">
        {this.renderHeader()}
        {this.state.showAddChannelView
          ? this.renderClosableOverlay()
          : this.renderGroups()}
      </div>
    );
  }

  public renderGroups() {
    return (
      <div className="module-conversations-list-content">
        <SessionSearchInput
          searchString={this.props.searchTerm}
          onChange={this.updateSearchBound}
          placeholder={window.i18n('search')}
        />
        {this.renderList()}
        {this.renderBottomButtons()}
      </div>
    );
  }

  public updateSearch(searchTerm: string) {
    const { updateSearchTerm, clearSearch } = this.props;

    if (!searchTerm) {
      clearSearch();

      return;
    }

    this.setState({ channelUrlPasted: '' });

    if (updateSearchTerm) {
      updateSearchTerm(searchTerm);
    }

    if (searchTerm.length < 2) {
      return;
    }

    const cleanedTerm = cleanSearchTerm(searchTerm);
    if (!cleanedTerm) {
      return;
    }

    this.debouncedSearch(cleanedTerm);
  }

  public clearSearch() {
    this.props.clearSearch();
  }

  public search() {
    const { search } = this.props;
    const { searchTerm, isSecondaryDevice } = this.props;

    if (search) {
      search(searchTerm, {
        noteToSelf: window.i18n('noteToSelf').toLowerCase(),
        ourNumber: window.textsecure.storage.user.getNumber(),
        regionCode: '',
        isSecondaryDevice,
      });
    }
  }

  private handleToggleOverlay() {
    this.setState(prevState => ({
      showAddChannelView: !prevState.showAddChannelView,
    }));
  }

  private renderClosableOverlay() {
    const { searchTerm } = this.props;
    const { loading } = this.state;

    return (
      <SessionClosableOverlay
        overlayMode="channel"
        onChangeSessionID={this.handleOnPasteUrl}
        onCloseClick={this.handleToggleOverlay}
        onButtonClick={this.handleJoinChannelButtonClick}
        searchTerm={searchTerm}
        updateSearch={this.updateSearchBound}
        showSpinner={loading}
      />
    );
  }

  private renderBottomButtons(): JSX.Element {
    const edit = window.i18n('edit');
    const addChannel = window.i18n('addChannel');
    const showEditButton = false;

    return (
      <div className="left-pane-contact-bottom-buttons">
        {showEditButton && (
          <SessionButton
            text={edit}
            buttonType={SessionButtonType.SquareOutline}
            buttonColor={SessionButtonColor.White}
          />
        )}
        <SessionButton
          text={addChannel}
          buttonType={SessionButtonType.SquareOutline}
          buttonColor={SessionButtonColor.Green}
          onClick={this.handleToggleOverlay}
        />
      </div>
    );
  }

  private handleOnPasteUrl(value: string) {
    this.setState({ channelUrlPasted: value });
  }

  private handleJoinChannelButtonClick() {
    const { loading, channelUrlPasted } = this.state;

    if (loading) {
      return false;
    }

    const regexURL = /(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?/;

    if (channelUrlPasted.length <= 0) {
      window.pushToast({
        title: window.i18n('noServerURL'),
        type: 'error',
        id: 'connectToServerFail',
      });

      return false;
    }

    if (!regexURL.test(channelUrlPasted)) {
      window.pushToast({
        title: window.i18n('noServerURL'),
        type: 'error',
        id: 'connectToServerFail',
      });

      return false;
    }

    joinChannelStateManager(this, channelUrlPasted, this.handleToggleOverlay);

    return true;
  }
}

export function joinChannelStateManager(
  thisRef: any,
  serverURL: string,
  onSuccess?: any
) {
  // Any component that uses this function MUST have the keys [loading, connectSuccess]
  // in their State

  // TODO: Make this not hard coded
  const channelId = 1;
  thisRef.setState({ loading: true });
  const connectionResult = window.attemptConnection(serverURL, channelId);

  // Give 5s maximum for promise to revole. Else, throw error.
  const connectionTimeout = setTimeout(() => {
    if (!thisRef.state.connectSuccess) {
      thisRef.setState({ loading: false });
      window.pushToast({
        title: window.i18n('connectToServerFail'),
        type: 'error',
        id: 'connectToServerFail',
      });

      return;
    }
  }, window.CONSTANTS.MAX_CONNECTION_DURATION);

  connectionResult
    .then(() => {
      clearTimeout(connectionTimeout);

      if (thisRef.state.loading) {
        thisRef.setState({
          connectSuccess: true,
          loading: false,
        });
        window.pushToast({
          title: window.i18n('connectToServerSuccess'),
          id: 'connectToServerSuccess',
          type: 'success',
        });

        if (onSuccess) {
          onSuccess();
        }
      }
    })
    .catch((connectionError: string) => {
      clearTimeout(connectionTimeout);
      thisRef.setState({
        connectSuccess: true,
        loading: false,
      });
      window.pushToast({
        title: connectionError,
        id: 'connectToServerFail',
        type: 'error',
      });

      return false;
    });

  return true;
}
