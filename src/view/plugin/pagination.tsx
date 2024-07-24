import { h, Fragment, JSX } from 'preact';
import PaginationLimit from '../../pipeline/limit/pagination';
import { classJoin, className } from '../../util/className';
import ServerPaginationLimit from '../../pipeline/limit/serverPagination';
import { useConfig } from '../../hooks/useConfig';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslator } from '../../i18n/language';

export interface PaginationConfig {
  limit?: number;
  page?: number;
  summary?: boolean;
  nextButton?: boolean;
  prevButton?: boolean;
  buttonsCount?: number;
  resetPageOnUpdate?: boolean;
  showDropdown?: boolean;
  limitSelector?: number[];
  server?: {
    url?: (prevUrl: string, page: number, limit: number) => string;
    body?: (prevBody: BodyInit, page: number, limit: number) => BodyInit;
  };
}

export function Pagination() {
  const config = useConfig();
  const {
    server,
    summary = true,
    nextButton = true,
    prevButton = true,
    showDropdown = false,
    buttonsCount = 3,
    limit = 10,
    page = 0,
    resetPageOnUpdate = true,
    limitSelector = [],
  } = config.pagination as PaginationConfig;

  const processor = useRef<PaginationLimit | ServerPaginationLimit>(null);
  const [currentPage, setCurrentPage] = useState(page);
  const [currentLimit, setCurrentLimit] = useState(limit);
  const [total, setTotal] = useState(0);
  const _ = useTranslator();

  useEffect(() => {
    if (server) {
      processor.current = new ServerPaginationLimit({
        limit: currentLimit,
        page: currentPage,
        url: server.url,
        body: server.body,
      });

      config.pipeline.register(processor.current);
    } else {
      processor.current = new PaginationLimit({
        limit: currentLimit,
        page: currentPage,
      });

      config.pipeline.register(processor.current);
    }

    if (processor.current instanceof ServerPaginationLimit) {
      config.pipeline.on('afterProcess', (tabular) => setTotal(tabular.length));
    } else if (processor.current instanceof PaginationLimit) {
      // Pagination (all Limit processors) is the last step in the pipeline
      // and we assume that at this stage, we have the rows that we care about.
      // Let's grab the rows before processing Pagination and set total number of rows
      processor.current.on('beforeProcess', (tabular) =>
        setTotal(tabular.length),
      );
    }

    config.pipeline.on('updated', onUpdate);

    // we need to make sure that the state is set
    // to the default props when an error happens
    config.pipeline.on('error', () => {
      setTotal(0);
      setCurrentPage(0);
    });

    return () => {
      config.pipeline.unregister<object, object>(processor.current);
      config.pipeline.off('updated', onUpdate);
    };
  }, []);

  const onUpdate = (updatedProcessor) => {
    // this is to ensure that the current page is set to 0
    // when a processor is updated for some reason
    if (resetPageOnUpdate && updatedProcessor !== processor.current) {
      setCurrentPage(0);

      if (processor.current.props.page !== 0) {
        processor.current.setProps({
          page: 0,
        });
      }
    }
  };

  const pages = () => Math.ceil(total / currentLimit);

  const setPage = (page: number) => {
    if (page >= pages() || page < 0 || page === currentPage) {
      return null;
    }

    setCurrentPage(page);

    processor.current.setProps({
      page: page,
    });
  };

  const onSetLimit = (event: JSX.TargetedMouseEvent<HTMLSelectElement>) => {
    if (event.target instanceof HTMLSelectElement) {
      setLimit(parseInt(event.target.value, 10));
    }
  };

  const setLimit = (limit: number) => {
    setCurrentLimit(limit);
    setCurrentPage(0);
    processor.current.setProps({
      limit: limit,
      page: 0,
    });
  };

  const renderPages = () => {
    if (buttonsCount <= 0) {
      return null;
    }

    // how many pagination buttons to render?
    const maxCount: number = Math.min(pages(), buttonsCount);

    let pagePivot = Math.min(currentPage, Math.floor(maxCount / 2));
    if (currentPage + Math.floor(maxCount / 2) >= pages()) {
      pagePivot = maxCount - (pages() - currentPage);
    }

    return (
      <Fragment>
        {pages() > maxCount && currentPage - pagePivot > 0 && (
          <Fragment>
            <button
              tabIndex={0}
              role="button"
              onClick={() => setPage(0)}
              title={_('pagination.firstPage')}
              aria-label={_('pagination.firstPage')}
              className={config.className.paginationButton}
            >
              {_('1')}
            </button>
            <button
              tabIndex={-1}
              className={classJoin(
                className('spread'),
                config.className.paginationButton,
              )}
            >
              ...
            </button>
          </Fragment>
        )}

        {Array.from(Array(maxCount).keys())
          .map((i) => currentPage + (i - pagePivot))
          .map((i) => (
            <button
              tabIndex={0}
              role="button"
              onClick={() => setPage(i)}
              className={classJoin(
                currentPage === i
                  ? classJoin(
                    className('currentPage'),
                    config.className.paginationButtonCurrent,
                  )
                  : null,
                config.className.paginationButton,
              )}
              title={_('pagination.page', i + 1)}
              aria-label={_('pagination.page', i + 1)}
            >
              {_(`${i + 1}`)}
            </button>
          ))}

        {pages() > maxCount && pages() > currentPage + pagePivot + 1 && (
          <Fragment>
            <button
              tabIndex={-1}
              className={classJoin(
                className('spread'),
                config.className.paginationButton,
              )}
            >
              ...
            </button>
            <button
              tabIndex={0}
              role="button"
              onClick={() => setPage(pages() - 1)}
              title={_('pagination.page', pages())}
              aria-label={_('pagination.page', pages())}
              className={config.className.paginationButton}
            >
              {_(`${pages()}`)}
            </button>
          </Fragment>
        )}
      </Fragment>
    );
  };

  const renderSummary = () => {
    return (
      <Fragment>
        {summary && total > 0 && (
          <div
            role="status"
            aria-live="polite"
            className={classJoin(
              className('summary'),
              config.className.paginationSummary,
            )}
            title={_('pagination.navigate', currentPage + 1, pages())}
          >
            {_('pagination.showing')} <b>{_(`${currentPage * currentLimit + 1}`)}</b>{' '}
            {_('pagination.to')}{' '}
            <b>{_(`${Math.min((currentPage + 1) * currentLimit, total)}`)}</b>{' '}
            {_('pagination.of')} <b>{_(`${total}`)}</b>{' '}
            {_('pagination.results')}
          </div>
        )}
      </Fragment>
    );
  };

  const renderLimitSelector = () => {
    if (!limitSelector || limitSelector.length === 0) {
      return null;
    }

    return (
      <div
        className={classJoin(
          className('limit-selector'),
          config.className.paginationSummary,
        )}
      >
        {_('pagination.limit')}{' '}
        <select
          onChange={onSetLimit}
          value={currentLimit}
          className={className('limit-selector')}
        >
          {limitSelector.map((limit) => (
            <option value={limit}>{limit}</option>
          ))}
        </select>
      </div>
    );
  };

  function handlePageChange(event: JSX.TargetedMouseEvent<HTMLSelectElement>) {
    if (event.target instanceof HTMLSelectElement) {
      setPage(parseInt(event.target.value, 10));
    }
  }

  return (
    <div
      className={classJoin(
        className('pagination'),
        config.className.pagination,
      )}
    >
      {renderSummary()}
      {limitSelector && (renderLimitSelector())}


      <div className={className('pages')}>
        {prevButton && (
          <button
            tabIndex={0}
            role="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            title={_('pagination.previous')}
            aria-label={_('pagination.previous')}
            className={classJoin(
              config.className.paginationButton,
              config.className.paginationButtonPrev,
            )}
          >
            {_('pagination.previous')}
          </button>
        )}

        {renderPages()}

        {showDropdown && (<select
          value={currentPage}
          onChange={handlePageChange}
          aria-label={_('pagination.selectPage')}
        >
          {Array.from({ length: pages() }, (_, index) => (
            <option key={index} value={index} selected={index === currentPage}>
              {index + 1}
            </option>
          ))}
        </select>)}

        {nextButton && (
          <button
            tabIndex={0}
            role="button"
            disabled={pages() === currentPage + 1 || pages() === 0}
            onClick={() => setPage(currentPage + 1)}
            title={_('pagination.next')}
            aria-label={_('pagination.next')}
            className={classJoin(
              config.className.paginationButton,
              config.className.paginationButtonNext,
            )}
          >
            {_('pagination.next')}
          </button>
        )}

      </div>
    </div>
  );
}
